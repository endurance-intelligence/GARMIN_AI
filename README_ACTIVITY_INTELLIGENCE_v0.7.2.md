# GARMIN_AI v0.7.2 — Activity Intelligence Foundation

The existing `backfill-garmin-details` worker remains the only importer. The existing `garmin_activity_details` row owns FIT metadata; a private child table holds bounded record chunks to avoid large database requests.

## What changes

- Keeps original activity summary, 1,800-point API chart and existing Garmin details import.
- Adds authorized Garmin activity export (`/download-service/files/activity/{id}`) and parses FIT using Garmin's official JavaScript SDK.
- Stores all validated FIT records (up to 200,000 per activity) in private chunks keyed to the *existing* activity detail row, plus FIT sessions, laps, events and workout steps, if available. GPS coordinates and ZIP bytes are deliberately not retained.
- Derives deterministic 100 m terrain windows from distance and filtered elevation. Every terrain window is evidence about the route, not an inference about athlete fitness or effort. Incomplete elevation coverage is explicitly marked.
- Enables existing Garmin `/workouts` detail request for running activities, not just strength and mobility.
- Adds independent, bounded FIT claim/retry status in the same details table, protected by the existing cron token and service-role-only functions.
- The existing private `read-garmin-session` endpoint prefers original FIT records for graph sampling and exposes terrain windows and quality metadata, without sending every high-frequency record to the browser.

## Operational limits / safety

- No GPS coordinates, Garmin API keys, access tokens or raw FIT binary in the database or response.
- No new secret, no change to existing Garmin writes (the import is GET-only).
- FIT downloads may not be available for every sport/activity; failures are retried or marked unavailable, with a visible status. Parsing failures are not silently replaced with invented data.
- FIT records are *not* equivalent to ground-truth physiology. A 12% uphill section explains the mechanical context of pace and HF, but does not automatically validate exercise intensity.
- The HR trend analysis/coach rules remain unchanged until the new evidence is empirically checked.
- Node tests cover an actual 12% climb, descent, elevation spike, missing elevation and GPS distance-gap handling. Live Garmin FIT download and Deno/Supabase deployment cannot be tested without the authorized runtime.

## Installation checks

Run tests before migration and deployment:

```powershell
node --test .\tests\activity-terrain.test.mjs
npm.cmd run lint
npm.cmd run build
```

Check the migration and Supabase project before any database change. The migration is additive but affects a live private activity table and should be reviewed in SQL Editor. Deploy `backfill-garmin-details` and `read-garmin-session` only after the DB migration has been applied; otherwise the new RPC is missing.

Validation SQL after deployment:

```sql
SELECT fit_status, count(*) AS activities,
       max(fit_fetched_at) AS last_fit,
       max(fit_record_count) AS max_records,
       max(jsonb_array_length(fit_terrain)) AS max_terrain_windows
FROM public.garmin_activity_details
GROUP BY fit_status ORDER BY fit_status;

SELECT d.activity_id, d.fit_status,
       d.fit_record_count AS records,
       d.fit_quality->>'elevationCoverage' AS elevation_coverage,
       d.fit_quality->>'terrainQuality' AS terrain_quality,
       jsonb_array_length(d.fit_terrain) AS windows
FROM public.garmin_activity_details d
WHERE d.fit_status = 'complete'
ORDER BY d.fit_fetched_at DESC LIMIT 5;
```

## Acceptance gates

1. A known flat run, hilly run and structured interval run can be downloaded and decoded as valid FIT.
2. Sample counts, distance, timestamps and total recorded ascent are plausible compared with Garmin Connect. No fabricated intervals; distinguish missing workout steps from unavailable workout details.
3. A measured uphill window is correlated to the *same distance/time section* of the heart-rate and speed series; no per-kilometer-only judgement.
4. Missing/barometrically noisy elevation is labeled uncertain and cannot trigger categorical terrain-based coach claims.
5. No change to other Garmin import jobs, existing session UX, plan edits or secrets.

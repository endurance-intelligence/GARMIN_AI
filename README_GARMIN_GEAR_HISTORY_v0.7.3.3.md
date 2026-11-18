# GARMIN_AI v0.7.3.3 – Garmin Gear History

## What changed

The v0.7.3.2 Garmin Connect snapshot could only confirm the shoe link for one test activity. This patch adds a read-only gear-history sync across all 18 previously verified pieces of equipment using `Garmin.getGearActivities(gearUuid,1000)`. The call returns the linked activity IDs, not FIT/GPS/HR data. No Garmin plan or activity is modified.

* A local script, `node scripts/garmin-connect-gear-history.mjs`, reuses tokens from the already verified local Garmin login.
* It validates every gear response and aborts without touching Supabase if the API returned 1000 entries for one gear, missing activity IDs, an error, or an inconsistency with the previously verified activity–gear link.
* Successful results are written only to `%LOCALAPPDATA%\GARMIN_AI\garmin-connect-gear-history.json`.
* Localhost combines this history with the previously approved gear/calendar summary and sets `completeHistory:true` only when every Garmin gear has been checked.
* The existing owner-only `garmin-connect-snapshot` Edge Function accepts a complete link set, preserving the existing snapshot table. It will not overwrite complete history with an older partial snapshot.
* When the scope is complete, the Edge Function calculates distance **from the canonical `garmin_activities` table**, never from a client-provided total. The Equipment screen shows associated activity counts and known kilometers, flagging links whose activity/distance is missing.
* No new migration is needed. No GPS, Garmin tokens, passwords or full activity objects are transferred.

## Quick verification

1. Run `node --test tests/garmin-gear-history.test.mjs tests/garmin-connect-snapshot.test.mjs`.
2. Run `npm run build`.
3. Deploy the updated Edge Function `supabase functions deploy garmin-connect-snapshot --project-ref eurgupsebxypjqvyizci`.
4. Run `node scripts/garmin-connect-gear-history.mjs` locally, in your interactive PowerShell.
5. Restart Vite (`npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`).
6. In Equipment click **Lokalen Garmin-Bericht übernehmen** and approve the exact record count. Inspect the known kilometers and missing-data warning.

## Interpretation

The validated gear-assignment history is not equal to complete activity data coverage. For example, historical Garmin gear links may refer to activities not yet in `garmin_activities`. Those activities are explicitly counted as missing, and the displayed kilometers are labelled **bekannte km**. The Gear view includes non-running equipment as well; kilometers refer to the actual distance on each linked activity, not an assumed running pace or invented usage.

The snapshot is manually approved, not continuously refreshed. This patch does not add unattended Garmin authentication or Garmin workout publishing. Those are separate tasks.

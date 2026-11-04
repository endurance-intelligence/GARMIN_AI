# GARMIN_AI v0.7.3 – Read-only Garmin Connect context

## Scope

Backend-only, opt-in access to Garmin Connect **equipment** and **scheduled workout summaries**. Uses the existing `read-garmin-session` owner-authenticated Supabase Edge Function. No new tables, cron jobs, FIT changes or Garmin write operations. No bulk gear backfill. **Frontend components are not part of the supplied review ZIP**, so this patch does not add UI elements.

## New private GET routes

- `.../read-garmin-session?context=1` — equipment catalog + scheduled workouts (default UTC date range: previous 7 to next 28 days).
- `.../read-garmin-session?context=1&id=24725092836` — as above, plus equipment *assigned by Garmin Connect* to this activity (the ID must exist in `garmin_activities`).
- `.../read-garmin-session?context=1&startDate=2026-11-01&endDate=2026-11-30` — custom period, max 45 calendar days.

Supply the same Supabase Auth `Authorization: Bearer <session JWT>` as the existing endpoint (and usual Supabase apikey header if required by gateway). Requests must originate from the allowlisted localhost dev origins or have no Origin header. Only the configured confirmed account owner is allowed. **Do not put the Garmin API key in browser code or PowerShell arguments.**

`gearCatalog`, `schedule`, `activityGear` return `{status: "ok", data: {items, mayHaveMore}}` or `{status: "unavailable" | "rate-limited" | "access-denied" | "unsupported-shape" | "unconfigured" | "read-error" | "upstream-error", data:null}`. `status=ok, items=[]` is the **only** empty-list case; errors are not misrepresented as no equipment/workouts.

Current source: Garmin Connect unofficial endpoints (may change):

- `GET /gear-service/gear/v2/list?start=0&limit=100`
- `GET /gear-service/activity/v2/{activityId}`
- `GET /workout-service/schedule/workoutScheduleByPeriod?startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}`

This shows *assigned* gear, not independently confirmed real-world shoe use. Calendar returns scheduled workout **summaries**, not complete interval step definitions. Date window is computed in UTC unless explicitly specified.

## Verification

1. `node --test tests/garmin-context.test.mjs` — pure normalization / date bounds / privacy tests.
2. `git diff --check` and targeted ESLint for new files and modified Edge Function (existing project-wide lint may have prior unrelated failures).
3. Build existing frontend (`npm.cmd run build`). This does **not** type-check Deno Edge Functions; perform `supabase functions deploy read-garmin-session` and authenticated live GET smoke tests before marking Garmin integration as verified.
4. In live response, check `gearCatalog.status`, `schedule.status`, and `activityGear.status` independently. Do not assume `[]` means success unless status is `ok`.

## Out of scope

- No mutation of Garmin workouts, device sync, or schedule.
- No gear data persisted locally, no shoe-mileage calculations, and no historical bulk enrichment yet.
- No changes to the already-live FIT worker, migrations, cron, or coach scoring.

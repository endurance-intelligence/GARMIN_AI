# GARMIN_AI v0.7.3.2 — Garmin Connect snapshot

## Scope

This branch extends the already-tested local Garmin Connect sign-in from v0.7.3.1 without moving any Garmin tokens or passwords into Supabase, Git, or browser code.

* Local Vite route `/api/garmin-context-local/snapshot` exposes **only whitelisted** fields from the local sanitized report, **only via loopback localhost**.
* Existing Supabase owner authentication secures `garmin-connect-snapshot` Edge Function.
* One private row in `garmin_connect_snapshot` stores gear, planned workout summaries, and known activity–gear assignments atomically.
* The Equipment page shows the actual gear list, not invented shoe mileage. Training shows scheduled workout summaries.
* No write call to Garmin. The Supabase import only occurs on the user's explicit button click and confirmation.

## Known scope limits (do not misrepresent)

The local v0.7.3.1 report contains gear for all returned gear items and scheduled workouts for a **moving 35-day window**. It contains the gear assignment of **only activity 24725092836**, not all 612 historic activities. The persisted snapshot explicitly records `activity_gear_scope = single-activity`. Do not calculate total shoe distance from it. There is no automatic recurring cloud refresh (it requires a fresh local verification and user-approved import). Exporting structured workouts to Garmin is deliberately not implemented.

## Validation steps

1. From the v0.7.3.1 branch create/check out `feature/garmin-context-snapshot-v0.7.3.2`.
2. Run `node --test tests/garmin-connect-snapshot.test.mjs` (requires Node 24; it strips TypeScript types), then `npm run build`.
3. Confirm `supabase db push --linked --dry-run` proposes only `20261105100000_garmin_connect_snapshot.sql`.
4. Apply the migration and deploy `garmin-connect-snapshot` with normal JWT verification enabled.
5. Run `node scripts/garmin-connect-verify.mjs` to refresh the local, sanitized report. No Garmin credentials are stored in Git or Supabase.
6. Start `npm run dev`, log into Supabase, open Equipment, and click **Lokalen Garmin-Bericht übernehmen**. Explicitly approve the one-time Supabase write.
7. Verify Equipment shows the real gear and Training shows the calendar entries. SQL can verify the private snapshot with service-role editor: `select jsonb_array_length(gear), jsonb_array_length(schedule), jsonb_array_length(activity_gear), activity_gear_scope, checked_at from public.garmin_connect_snapshot;`

## Security

Keep `%LOCALAPPDATA%\\GARMIN_AI\\garmin-connect-tokens` private. The local report is token-free but still contains personal equipment/calendar metadata; do not share it publicly. Both database and Edge Function restrict access to the account owner. The browser uses only the user's Supabase access token, not Garmin credentials.

## Remaining acceptance work

1. Retrieve **complete activity–gear assignments** (with pagination, failure visibility, and progress) and revalidate total mileage before showing any shoe distances.
2. Implement a bounded, renewable synchronization strategy (not a cloud Garmin password store), and verify expiry/recovery.
3. Evaluate Garmin workout publishing separately; only execute writes after the user approves a concrete proposed plan.

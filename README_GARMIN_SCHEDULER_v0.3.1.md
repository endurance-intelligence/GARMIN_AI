# GARMIN_AI v0.3.1 – automatic Garmin sync

Prerequisite: v0.3.0 committed and deployed, functional Garmin API key in Supabase Edge Secrets, and Supabase CLI linked to `eurgupsebxypjqvyizci`.

The feature runs every three hours at minute 15 UTC, imports the 10 most recent Garmin activities (upsert), and stores successful sync events in `public.garmin_sync_runs`. It does **not** import health metrics yet and does **not** integrate the browser dashboard with Supabase yet.

## Design

- Supabase Cron (`pg_cron`) schedules `garmin_private.dispatch_garmin_sync()`.
- `pg_net` sends an HTTPS POST to the existing `sync-garmin` Edge Function.
- A random 256-bit shared token is generated **inside Postgres** and encrypted by Supabase Vault. Neither the SQL migration, local files, Git history nor the Edge Function environment contain its value.
- A service-role-only RPC `public.garmin_verify_cron_token` validates the token on the server. No anonymous/authenticated execution rights are granted.
- Garmin Personal API key remains in Supabase Edge Function secrets. The Edge Function reads Garmin; never writes to it.
- The original `GARMIN_SYNC_SECRET` secret from v0.3.0 is no longer used; it can be removed from Edge Function Secrets after successful verification.

## Deployment

Extract this package into the GARMIN_AI project on `feature/garmin-scheduler-v0.3.1` and run `Install-GarminScheduler.ps1`. A Git commit and push are **not** automatic. The script deploys the Edge Function and installs the migration. No secret file is written to the local machine.

**Deployment order matters:** Edge Function first, migration second; there is a short window when the old manual test secret no longer works. The migration automatically triggers an initial request once committed.

## Verify

Supabase Dashboard → Database → Cron → Jobs: `garmin-ai-activities-every-3h`. Supabase Dashboard → Database → Tables → `garmin_sync_runs`: latest successful synchronization should appear after the initial request finishes. Edge Function logs show errors (if any). `pg_net` logs its HTTP results in `net._http_response` for a limited time.

## Caution

`pg_net` may briefly hold the decrypted request header in its internal request queue until delivery. Keep direct database access and service-role credentials restricted. The initial scheduler token is scoped to this single GARMIN_AI project.

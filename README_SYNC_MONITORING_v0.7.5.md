# GARMIN_AI v0.7.5 — Sync Reliability / Mobile Operations

## Objective

Reliable Garmin data, not more features. Mobile is the target interface. Supabase must remain the location of record and background work must NOT require a Windows browser or Vite localhost. The existing Garmin Personal API ingestion and detail/FIT queues are reused.

## Implemented in this branch

1. **Observed success vs. failure:** `sync-garmin` now records failures in the existing private `garmin_sync_runs` log, not just successful runs. Existing activity source defaults remain intact. `sync-garmin-health` already reports `garmin-health` success and error, plus partial source coverage.
2. **Actual freshness:** the authenticated `garmin-sync-center` Edge Function checks the last attempt AND last success for activities and health; it reports `ok`, `stale`, `failed`, `partial`, or `unknown` instead of a synthetic score. Default windows: activity 3 hours, health 30 hours. These are monitoring thresholds, not training goals.
3. **Real FIT queue:** the same private Edge Function counts `queued`, `retry`, `processing`, `paused`, `unavailable`, `complete` from the existing `garmin_activity_details` table. No second worker or FIT importer.
4. **Scheduler dispatch:** private, service-role-only RPC `garmin_sync_scheduler_status()` reads only Garmin-related pg_cron job names, enabled flags and last dispatch metadata. It explicitly DOES NOT expose cron SQL commands, token values or job secrets. A successful cron dispatch is NOT evidence that the target Edge Function reached Garmin.
5. **Existing equipment/calendar:** remain labeled `manual`, with their last verified timestamp (not a misleading green/automatic state). No changes to the 411 gear assignments, private shoe photos, or per-activity Garmin writes.
6. **Weight outbox:** unchanged. Manual kg entry remains `pending` until a verified server-side Garmin Connect writer exists; no fake claim of successful upload.
7. **Phone UX:** diagnostics fit into the existing responsive Settings page with collapsible cron details and readable states.

## Server-side boundary for upcoming cloud Connect integration

Garmin's official **Personal API is read-only for this app**. The current unofficial Garmin Connect session resides in the Windows-only LOCALAPPDATA token store. Do not send that token or a Garmin password in source code, browser localStorage, public GitHub, or chat.

For truly automatic **gear/calendar sync** and **morning weight upload** while Windows is off, a future dedicated service must:
- Provide explicit user authorization and a private cloud token store with restricted read/write privileges and rotation; no unreviewed export of local tokens.
- Run bounded Garmin Connect reads, keep a full-catalog checkpoint, and replace activity gear mappings atomically only after all gear is verified. Respect 429/timeouts and Garmin API changes.
- Refresh the calendar separately, preserving existing gear history when calendar requests fail.
- Process weight outbox with claim locks and an idempotency rule: *read Garmin's weight for date first*, write **only if absent**, read back and confirm matching date+kg, then mark confirmed. Uncertain network results become `needs_review`, never blind retries.
- Retain an immutable audit trail for each Garmin write; ensure authenticated owner-only controls, consent status, explicit error states and simple disconnect/rotate.
- Host the React app on private HTTPS before describing it as an independent mobile app. The existing Vite localhost is NOT accessible when the PC is off.

This branch intentionally does **not** manufacture automatic Garmin Connect access out of the read-only Personal API.

## Deployment

Parent: `feature/sync-foundation-mobile-v0.7.4`.
Branch: `feature/sync-monitoring-v0.7.5`.

- Tests: `node --test tests/sync-health.test.mjs tests/weight-entry.test.mjs` (optionally full previously validated gear tests).
- Build: `npm run build` (TypeScript + Vite).
- Dry-run `supabase db push --linked --dry-run`; only `20261106180000_sync_observability.sql` should be pending. STOP on unexpected migrations.
- Deploy `garmin-sync-center` with `--no-verify-jwt` because the function independently authenticates Supabase owner JWT using `auth.getUser`. Deploy existing `sync-garmin` with `--no-verify-jwt` because it authenticates with an independent 256-bit scheduler secret through the Vault-backed RPC. No other Edge Function or schedule changes.
- Restart Vite on 127.0.0.1:5173, open Settings -> Synchronisierungsstatus and press Prüfen.
- Verify: an actual successful activity job reports `Aktuell`, a simulated log-failure report in tests is `Fehlgeschlagen`, missing history is `Nicht verifiziert`, and gear/calendar say `Manueller Abgleich`.
- Inspect scheduler diagnostics. If no jobs are listed, investigate cron job names/scheduling; do not claim automatic sync works.
- On Home, any saved weight still says `Übertragung zu Garmin ausstehend`.

This is the **monitoring and correctness foundation**, not the final cloud Garmin Connect connector and not a production mobile deployment.

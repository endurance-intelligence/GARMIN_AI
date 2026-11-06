# GARMIN_AI v0.7.4 — Mobile-first Sync Foundation

## Goal

One consistent, **observable** Garmin integration. No second activity pipeline and no "always green" synthetic health/quality scores. Phone access will become the primary client; scheduled jobs run independently of the phone and Windows/Vite.

## Already in this repository (reused, not duplicated)

- `sync-garmin`: cron-triggered Garmin Personal API activity ingestion; this branch changes the bounded rolling read from 10 to **40 latest activities** to pick up more *recent* edits. This is NOT an unlimited historical backfill.
- `sync-garmin-health`: nightly/daily health data, 15-day late-upload reconciliation.
- `backfill-garmin-details`: canonical detail and FIT worker, existing queue/retries.
- `garmin-connect-snapshot`: historical gear/activity links and calendar snapshots. These still depend on locally authenticated Garmin Connect reads, including equipment status and manual verified gear reconciliation.

## Implemented in v0.7.4

1. `garmin-sync-center` — private, owner-authorized Supabase Edge Function GET provides actual recent dates/statuses from **existing** tables. It does not launch new Garmin imports or access Garmin tokens.
2. On the Coach page, an uncluttered mobile-friendly **Gewicht eintragen** area with a large numeric keyboard input, date, kg and a clearly distinguished status.
3. A private `garmin_weight_outbox` stores one measurement per day, idempotently updatable **only while pending**. Status is always `pending` after first entry; nothing in this release falsely claims it was sent to Garmin. RLS blocks anon/authenticated direct access; Edge Function verifies account and uses service_role for narrowly allowlisted reads/writes.
4. Settings -> Synchronisierungsstatus reads real activity log timestamps, health row freshness, equipment mapping timestamp, and calendar snapshot timestamp. An unavailable source is shown as unavailable, not as a green checkmark.
5. Mobile-first responsive controls; the same Supabase Auth identity is used.

## Weight upload to Garmin — explicit next step

Garmin's **Personal API is pull-only**. `garminconnect-js@0.11.0` has a verified `addWeighIn(kg, 'kg')` method via the unofficial Garmin Connect session. The token used by the Vite development adapter currently resides in `%LOCALAPPDATA%\GARMIN_AI\garmin-connect-tokens`, so that adapter **cannot serve mobile clients once the Windows PC is switched off**.

We must introduce a properly authenticated, secret-backed **server-side Garmin Connect writer** before activating automatic weight transfers. Minimum acceptance:

- never store Garmin passwords/tokens in browser or public GitHub;
- use a protected server-side session/refresh approach, with consent/re-authentication and explicit opt-in;
- process each outbox entry idempotently (do not double-submit on timeout);
- write in **kg** (never multiply by 1000), then independently read the date back from Garmin and confirm matching value;
- mark `confirmed` only after verified Garmin record. An uncertain response becomes `needs_review` rather than retrying blindly;
- document connectivity/expiration. Garmin Connect unofficial endpoints are not stable.

This branch deliberately **does not deploy a cloud Garmin writer** before that security and round-trip test. Pending data is not lost and can be transferred after this is implemented.

## Mobile deployment and CORS

The React app must later be served on an HTTPS URL reachable from a phone; Vite localhost is a development server, not a hosted mobile deployment. Configure `GARMIN_APP_ORIGINS` for the chosen HTTPS app origin (comma separated) **after** choosing the hosting URL. Only a logged-in, confirmed owner can read/write weight and sync status. The app must not expose service-role or Garmin API keys.

## Verification

1. From clean `feature/activity-shoe-editor-v0.7.3.7`, switch to `feature/sync-foundation-mobile-v0.7.4`.
2. Run `node --test tests/weight-entry.test.mjs` and `npm run build`. Do not run production writes before tests pass.
3. Check only migration `20261106160000_mobile_sync_weight_queue.sql` pending, then `supabase db push --linked`. No changes to existing activity/gear history schemas.
4. Deploy `garmin-sync-center` (owner-only JWT verification **inside the function**) and redeploy `sync-garmin` with existing cron-token authentication and `--no-verify-jwt`.
5. Restart Vite and open Coach / Settings. Saving weight **must** say "Übertragung nach Garmin ausstehend" until verified writer ships.
6. The source status must show real last sync timestamps and detect stale health/activity records; don't claim all background processes are functioning merely because a table has historical rows.

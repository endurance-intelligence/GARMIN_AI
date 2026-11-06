# GARMIN_AI v0.7.6 — Supabase Vault / Garmin Connect Cloud Foundation

## Direction: Supabase remains the source of truth

The user rightly identified that we already operate **Supabase**, including encrypted **Vault** and Edge Secrets. The Garmin Personal API continues to power activities, health and FIT as it does today. We do not introduce a competing data pipeline or replace any Garmin history.

The unofficial `garminconnect-js@0.11.0` library is explicitly **Node.js only** (it uses `node:crypto`/Buffer); Supabase Edge Functions use Deno. Deno's Node compatibility is not a tested substitute for this library. The resulting KISS split:

- **Supabase Vault** stores encrypted OAuth1+OAuth2 Garmin Connect session JSON, never the password. Only an owner-approved one-time bootstrap can install it.
- **Supabase Postgres** owns versioned metadata and a private service-role-only SQL API for session load/rotate and safe status.
- **Supabase Edge Functions** continue to validate the logged-in owner for the mobile UI, show sanitized sync health and store queued weight measurements.
- A small **hosted Node worker** uses `garminconnect-js` to read Garmin Connect, refresh tokens, write back rotated tokens with compare-and-swap versioning, and eventually synchronize gear/calendar and verify weigh-ins. Hosting and schedule **are not yet provisioned**.
- A static **mobile-friendly HTTPS host** will serve the existing React app. Vite localhost is only a development server.

## This release's code

- Migration `20261106193000_garmin_connect_cloud_session.sql`: singleton, service-only version metadata and service-role-only RPC `garmin_connect_session_get`, `garmin_connect_session_store`, `garmin_connect_session_state`. Actual OAuth payload is encrypted inside Vault via `vault.create_secret` and `vault.update_secret`. The migration does **not** create or transfer any real credentials.
- `scripts/cloud/check-garmin-connect.mjs`: read-only Node cloud session smoke test. Requires trusted server environment `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, both never in browser/GitHub repository. After a successful Garmin read it persists a refreshed token pair back to Vault only if changed. Output is generic, without profile or token data.
- `scripts/cloud/garmin-cloud-session.mjs`: validation and token-rotation checks, `tests/garmin-cloud-session.test.mjs`.
- Existing owner-only `garmin-sync-center`: adds a safe Cloud Connect status field, which only signals whether a session was installed in Vault, **not** whether the latest Garmin request succeeded. The mobile UI shows that distinction in Settings.

## Provisioning sequence (separate explicit approvals required)

1. Run `node --test tests/garmin-cloud-session.test.mjs tests/sync-health.test.mjs tests/weight-entry.test.mjs` and `npm.cmd run build`.
2. Check the Supabase project ref `eurgupsebxypjqvyizci`. Dry-run DB migration. Only `20261106193000_garmin_connect_cloud_session.sql` may be pending. Apply it after approval.
3. Redeploy `garmin-sync-center` with `--no-verify-jwt`: the function already independently authenticates Supabase owner JWT and does not return raw tokens. No changes to existing activity/health/FIT jobs.
4. **Explicitly approve transferring the existing local Garmin Connect OAuth session** into Supabase Vault via a purpose-built owner-authorized one-time bootstrap (NOT implemented in this branch). Do not paste tokens in chat, CLI output, browser console, GitHub Actions logs, or GitHub source. Never transfer a Garmin password.
5. Choose a trusted Node execution host, then set its `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as private runtime secrets. Restrict deployment access; service role is a full administrative credential. Run the read-only smoke script there first and confirm the generic `verified (read-only)` status.
6. Only after live verification: add a bounded cloud gear/calendar worker, a full verified mapping diff, and a stateful weight outbox that reads Garmin before any write, verifies value/date, and does not retry uncertain writes blindly. Enforce single-flight locks and alerts.
7. Deploy the React app to HTTPS for phone use. Authorize that exact URL through `GARMIN_APP_ORIGINS` for the Edge Function. Review same-origin protections and authentication before exposing any Garmin write actions.

## Security acceptance

- No secrets in Git/CI artifact logs, client-side localStorage, Supabase public tables, or ordinary SQL rows.
- Only `service_role` may call the Vault load/store/status RPC. Clients authenticated with `anon` or `authenticated` cannot execute them.
- Reject mismatched versions to prevent an older worker overwriting a newer OAuth2 refresh token.
- Vault's encrypted storage is separate from end-to-end secrecy: a trusted Node runtime must still decrypt tokens *in memory* to call Garmin. This trusted runtime needs careful secret management and access control.
- All Garmin Connect API writes, including weight, require dedicated verified flows and audit logs. This release itself performs **no Garmin writes**, automatic gear refresh, or weight transfer.

## Scope boundary

Version 0.7.5 successfully monitors actual background jobs: 4 Garmin cron jobs active, activity and health current, FIT 605 complete and 4 retry (screenshot 2026-11-06). Version 0.7.6 only prepares a safe Vault bridge and read-only validation: it is NOT yet a working automatic cloud Garmin Connect connector.

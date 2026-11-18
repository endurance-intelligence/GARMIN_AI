# GARMIN_AI v0.7.6.2 — Read-only Supabase-to-Garmin live check

## Starting point

On 2026-11-06, the user confirmed Settings -> Sync Status displays:
- Activities and health **current**, server-side;
- 605 FIT complete, 3 pending retries;
- 4 Garmin cron dispatch jobs configured;
- Gear/calendar still **manual**;
- Cloud Connect session **already stored in Supabase Vault**, but not remotely tested.

## New feature

Settings -> Synchronisierungsstatus now offers **Cloud-Verbindung testen** after the Vault session has been installed. It requires the signed-in owner. The app POSTs the Supabase Auth JWT to `garmin-connect-cloud-check`, not the OAuth session itself.

The owner-verified Supabase Edge Function:

1. Verifies the real user via `auth.getUser` and `GARMIN_HEALTH_OWNER_EMAIL`, as in the existing Sync Center.
2. Uses the service-role-only RPC `garmin_connect_session_get()` to load the encrypted Garmin Connect OAuth envelope **inside the Edge function**. No OAuth token enters the browser or logs.
3. Refuses an expired/near-expiry OAuth2 token. This check does **not** refresh OAuth1/OAuth2.
4. Performs a single direct HTTPS GET to `https://connectapi.garmin.com/userprofile-service/socialProfile` with a private Bearer token and Garmin mobile User-Agent, no redirects. No new Garmin data is saved.
5. Considers the test successful only for 2xx HTTP and a recognized profile object. Personal profile identifiers are **never returned or persisted**.
6. Writes only the result code and timestamps to service-role-only `garmin_private.cloud_connect_check` via the private RPC `garmin_connect_cloud_check_record`.
7. Returns a sanitized result: `verified`, `expired`, `auth_failed`, `rate_limited`, `unavailable`, or `invalid_response`. The Sync Center subsequently reads the recorded status, distinguishing *Vault stored* from *Garmin reached*.

Do not interpret `verified` as a completed automated sync. Gear/calendar and the morning weight queue remain unchanged. No Garmin writes occur.

## Deployment

Parent: `feature/garmin-connect-vault-bootstrap-v0.7.6.1`.
Branch: `feature/garmin-cloud-livecheck-v0.7.6.2`.

- `node --test tests/garmin-cloud-check.test.mjs tests/garmin-connect-bootstrap.test.mjs tests/garmin-cloud-session.test.mjs`
- `npm run build`
- Supabase linked project **must** equal `eurgupsebxypjqvyizci`.
- Apply only pending migration `20261106200000_garmin_cloud_check_status.sql`; accept an already up-to-date database.
- Deploy `garmin-connect-cloud-check` and `garmin-sync-center`, both `--no-verify-jwt` because their server code verifies owner JWT independently.
- `scripts/deploy-cloud-livecheck-v0762.ps1` automates the local tests, checks and deployment after explicit approval. It never transfers OAuth tokens or invokes Garmin itself.
- In Settings, click `Cloud-Verbindung testen` once. On success the status reads `Garmin erreichbar` and the last verified timestamp. If expired/auth_failed/rate-limited, investigate instead of rapidly retrying.

## Next development, **not delivered here**

- A persistent private cloud **Node.js worker** using `garminconnect-js` and rotated Vault tokens; no Windows-PC dependence.
- Read-only scheduled gear and training calendar sync with complete-catalog validation and change detection.
- Controlled weight outbox processing: check existing weigh-in by date, write only with verification, never blindly repeat on timeout, and label confirmed only after a Garmin read.
- Private HTTPS mobile host for the React app (today it still runs in Vite on localhost).
- Resolve the remaining FIT retry errors independently.

The Edge live check confirms direct Supabase-to-Garmin network connectivity, not an indefinitely renewable Garmin session. All of the above must remain explicitly distinguished in the interface.

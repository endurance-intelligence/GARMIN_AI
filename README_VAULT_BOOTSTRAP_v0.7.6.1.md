# GARMIN_AI v0.7.6.1 — one-time local Garmin Connect -> Supabase Vault bootstrap

## Why

The existing Garmin Personal API ingestion runs without Windows. Gear/calendar reads and manual shoe writes still use a locally authenticated unofficial Garmin Connect client. We already have an encrypted Vault store and safe state API in v0.7.6; now the user needs a practical **owner-approved one-click transfer** of the existing OAuth session into Vault — without exposing tokens in browser JavaScript, terminal transcripts, GitHub, or ChatGPT.

## Flow

1. Log in to GARMIN_AI in the existing local Vite app on `http://127.0.0.1:5173`.
2. Settings -> Sync status shows `Garmin Connect Cloud: Noch keine Cloud-Sitzung eingerichtet`. If the Vault migration/RPC is unavailable, it explicitly displays an *unknown* state instead of a misleading disconnected state.
3. The new `Garmin Connect Cloud verbinden` button requires an explicit browser confirmation. It posts **only the Supabase owner JWT and `x-garmin-cloud-consent: ja`** to the local Vite adapter. No Garmin OAuth data enters the browser.
4. The Vite adapter rejects non-loopback sockets, foreign Host/Origin, non-POST requests and missing owner JWT/consent. It uses the existing private Sync Center to validate the owner, reads the existing local FileTokenStore from `%LOCALAPPDATA%\GARMIN_AI\garmin-connect-tokens`, performs one **read-only** `getUserProfile` against Garmin Connect to verify and refresh the session if necessary.
5. Only after that read succeeds, local Node uploads the valid OAuth1+OAuth2 object directly to `garmin-connect-bootstrap` Edge Function over HTTPS with the owner's JWT. The endpoint confirms owner e-mail and verified Supabase Auth user, strict project URL, and only permits initial `expectedVersion=0` write.
6. `garmin_connect_session_store` SQL RPC stores session JSON as an **encrypted Vault secret**, with a versioned singleton metadata row. The remote function returns only `saved:true`, never OAuth data. A second attempt or existing connection returns 409.
7. Settings shows `Sitzung im Supabase Vault gespeichert (Live-Verbindung noch nicht geprüft)`. This is correct: *secret present* does not mean cloud worker is running.

## Boundaries

- **No automatic cloud gear/calendar reader yet.** Node worker deployment, scheduling, monitoring and backfill are next.
- **No Garmin writes yet** (including weight). The existing weight outbox stays `pending`.
- No default shoe, historical shoe mapping, activity, sleep, HRV, calendar or FIT dataset is modified by bootstrap.
- The local Garmin OAuth token is sensitive: Vault encryption at rest does not make leaked service-role credentials safe. The Edge Function is owner-authenticated and only the service role may load/store Vault secrets.
- Vite must bind to `127.0.0.1:5173`, not `0.0.0.0`. This feature is intentionally unavailable on the phone or a public HTTPS site. It is a ONE-TIME local setup for eventual server-side mobile usage.
- `garminconnect-js` requires Node.js. A trusted, separately deployed Node worker will be necessary for unattended Garmin Connect calls. No credentials are copied by the install script.

## Deployment

Branch `feature/garmin-connect-vault-bootstrap-v0.7.6.1` based on `feature/garmin-connect-cloud-foundation-v0.7.6`.

The single file `scripts/deploy-cloud-bootstrap-v0761.ps1` checks clean branch, tests, TypeScript/Vite build, exact Supabase project, migration dry run, human deployment approval, deploys `garmin-connect-bootstrap` and `garmin-sync-center` only, and restarts localhost. It allows exactly the earlier v0.7.6 Vault migration to be pending; no unrelated migration is deployed.

Tests: `tests/garmin-connect-bootstrap.test.mjs`, `tests/garmin-cloud-session.test.mjs`, `tests/sync-health.test.mjs`, `tests/weight-entry.test.mjs`.

## Verification checkpoints

- Build/tests first. No credential transfer occurs during deployment.
- Refresh Settings and confirm the button exists and Vault status is `configured`.
- **Only on explicit user action**, click button, accept the transfer, then verify Settings shows a stored Cloud session. If Edge returns an uncertain status, first inspect the private status; DO NOT retry blindly.
- Next phase is to provision the private Node worker and run `scripts/cloud/check-garmin-connect.mjs` there, confirming the session still works when the Windows PC is switched off. This must pass BEFORE automated gear/calendar sync or Garmin weigh-ins.

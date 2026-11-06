# GARMIN_AI v0.7.7 — Cloud gear and calendar data audit

## Verified starting point (2026-11-06)

- A user-approved Garmin Connect OAuth session is encrypted in Supabase Vault.
- Supabase Edge Function performed a verified **read-only** Garmin Connect request (20:00 CET).
- Four existing Garmin cron jobs are active, activities and health current.
- FIT: 605 complete and 2 retries at the latest displayed state.
- Gear/calendar have been manually verified; 411 known activity-to-gear associations at prior checkpoint.

## Code delivered

- `scripts/cloud/garmin-cloud-data-audit-model.mjs`: verifies the **complete gear catalog including retired gear**, requires every gear history request to complete without Garmin's 1000-item truncation, and compares activity/gear links and upcoming scheduled workouts against the existing Supabase snapshot. It does not invent kilometers or re-classify unknown status as active.
- `scripts/cloud/audit-garmin-connect.mjs`: private Node.js reader for `garminconnect-js@0.11.0`. Reads OAuth tokens from service-role-only Vault RPC in memory, fetches live profile, gear, calendar and complete per-gear history, and prints **counts / diffs only**. It never persists gear/calendar/weight data to Supabase or changes any Garmin data.
- **Only if Garmin rotated OAuth tokens**, the script updates the encrypted Vault secret with expected-version protection, including after a partially failed data audit, to avoid losing a fresh token.
- `tests/garmin-cloud-data-audit.test.mjs`: tests full source coverage, a swapped shoe with unchanged count, rejected truncation, missing retired gear, unknown shapes and calendar adds/removes.

## Tests and acceptance

From the branch `feature/garmin-cloud-data-audit-v0.7.7`:

```powershell
node --test .\tests\garmin-cloud-data-audit.test.mjs .\tests\garmin-cloud-check.test.mjs
npm.cmd run build
```

The local tests use **synthetic data only**, not Garmin tokens.

## Boundaries

- This is **an auditable cloud worker**, not yet a *scheduled* job. The user has not yet selected/provisioned a dedicated trusted Node runtime. Running this Node program on a desktop would still depend on that desktop and would not meet the mobile-first requirement.
- The script needs `SUPABASE_URL` for project `eurgupsebxypjqvyizci` and **private service-role credentials** only on a trusted server; never commit/paste them into GitHub or a browser. It reads the Vault OAuth session via `garmin_connect_session_get`.
- No database migration or Supabase Edge Function deployment is required for this version.
- Future v0.7.7.x: provision a scheduled cloud Node runner with protected execution secrets, isolated service permissions, a finite retry budget and clear run logs; then enable atomic owner-only snapshot reconciliation after full validation (never partial history). Separate calendar freshness from gear freshness.
- Weight upload will follow *after* the unattended cloud token refresh has been verified. The weight outbox remains `pending`; do not send duplicate entries or claim Garmin confirmation before reading back the Garmin record.
- A browser-accessible HTTPS deployment is also needed before GARMIN_AI works independently on a phone.

## Safety

No user-facing secret sharing, no automatic Garmin writes, no legacy snapshot replacement. A successful cloud read only proves connectivity; it does not establish a long-lived scheduler or refresh reliability.

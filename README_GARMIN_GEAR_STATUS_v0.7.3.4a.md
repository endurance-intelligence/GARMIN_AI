# GARMIN_AI v0.7.3.4a — timeout-safe status-only update

## Incident

The Garmin status verification completed, but `garmin-connect-gear-history.mjs` timed out at gear #8 of 18. Previously verified history had already been imported (18 gear items, 411 gear/activity links). The status verification rewrote the local `garmin-connect-check.json` timestamp, so the old local bridge rejected the previously completed history as mismatched. Repeating all 18 history reads is unnecessary just to classify gear as active/retired.

## Fix

* Added `GET /api/garmin-context-local/gear-status`, a loopback-only, allowlisted response from the already saved local status verification report.
* Added `POST /functions/v1/garmin-connect-snapshot` branch for `mode:'gear-status'`, secured with the existing Supabase owner-authentication. It validates all existing gear IDs, allows only `active`/`retired`/`unknown`, and updates only the `gear` JSONB field and `synced_at` by conditional update. It does not re-fetch Garmin history, modify workout calendar, activity links, activity/FIT data, or Garmin itself.
* When a complete history is already saved, Equipment presents **Garmin-Status aktualisieren** instead of the full history import.
* The status-only path does not require old `baseReportCheckedAt` to equal the new verification's timestamp. That strict timestamp check remains for full-history uploads.
* No schema migration; no new Garmin authentication or access token handling.

## Install / verify

Starting on `feature/garmin-gear-status-v0.7.3.4`, switch to `feature/garmin-gear-status-only-v0.7.3.4a` after verifying a clean working tree. Run:
```
node --test tests/garmin-gear-status-only.test.mjs tests/garmin-connect-model.test.mjs tests/garmin-connect-snapshot.test.mjs tests/garmin-gear-history.test.mjs
npm run build
```
Deploy only `garmin-connect-snapshot` to project `eurgupsebxypjqvyizci`. Restart the localhost Vite server, navigate to Equipment, click **Garmin-Status aktualisieren**, and confirm the status counts. The 411 links should stay at 411 and previously known distances should remain. Retired gear should appear only in **Aussortiert / Archiv**.

Do **NOT** rerun the historical gear reader to complete this fix. The local status report from the successful verification is all that is required.

## Caveats

This is a manual, approved sync—not a recurring Garmin Connect sync. Unknown statuses are hidden from active groups and displayed separately. It does not delete anything from Garmin or the historical Supabase record.

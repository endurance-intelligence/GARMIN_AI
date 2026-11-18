# GARMIN_AI v0.7.3.1 — Garmin Connect authentication / read-only acceptance test

Scope: one-time local Garmin Connect SSO authentication (MFA supported), using the third-party `garminconnect-js@0.11.0` Node client; verify gear catalog, assigned gear on one known Garmin activity, and scheduled workout summaries. This is **not** yet a Supabase credential integration. This deliberately avoids changing production functions or the proven FIT pipeline until the correct Garmin Connect authentication is established.

Install dependency with `npm install --save-dev --save-exact garminconnect-js@0.11.0`, run `node --test tests/garmin-connect-model.test.mjs`, then `node scripts/garmin-connect-verify.mjs` from a real, interactive PowerShell window.

The Garmin password and MFA code are entered **hidden** directly in the Node process, never in a command-line argument, environment variable, browser or ChatGPT. The library saves renewable OAuth session tokens at `%LOCALAPPDATA%\\GARMIN_AI\\garmin-connect-tokens`, outside Git. Treat this folder like a password; do not upload or share it. The locally saved sanitized report is `%LOCALAPPDATA%\\GARMIN_AI\\garmin-connect-check.json`. Share only the displayed status table and optionally gear names, not the tokens. To revoke access, sign out/revoke the Garmin Connect session and delete the local tokens after closing the Node process.

Because Garmin Connect's API is unofficial, authentication and endpoints may change. The library's login mechanism may request consumer OAuth key material from the author's S3 endpoint (`thegarth.s3.amazonaws.com`) as documented by its maintainer. Install only if that third-party dependency and sign-in method are acceptable. It is NOT Garmin's official OAuth application authorization.

Expected: all three read areas return `status=ok` even if `count=0`. Any `request-failed`, `access-denied` or `unavailable` means this acceptance test is not passed. The test reports sanitized counts; no writes to Garmin are made.

Out of scope until the read-only live test passes: secure server-side production token store, persistence of gear/scheduled workouts into Supabase, reconciliation with 612 historic activities, training uploads/scheduling, automatic calendar writing. Only after those are implemented and tested can the data integration be marked complete.

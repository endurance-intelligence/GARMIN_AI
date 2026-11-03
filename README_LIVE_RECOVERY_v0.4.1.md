# GARMIN_AI v0.4.1 – Live Recovery Dashboard

This builds on v0.4.0 (commit `853e440` on `main`). It shows actual recorded HRV, resting HR, sleep, stress, Body Battery in the Coach page. The coach narrative, training decisions and session preview remain clearly labeled demo and cannot modify a real plan. The existing data ingestion and cron jobs are NOT modified.

## Security and access

- Private `garmin_daily_metrics` table stays RLS-protected and inaccessible to `anon` / `authenticated` through PostgREST.
- New `read-garmin-health` Edge Function checks a **valid Supabase Auth session via auth.getUser(token)** AND compares the **confirmed email** to `GARMIN_HEALTH_OWNER_EMAIL` stored in Supabase secrets.
- Cloud function uses an elevated Supabase key to query daily health data **only after verifying both conditions**.
- New publishable `sb_publishable_...` key is safe for use in the browser and is NOT an admin key. Never enter `sb_secret_...` or `service_role` into the installer's frontend prompt.
- CORS is restricted to local Vite URLs (`http://localhost`/`127.0.0.1`, ports 5173–5179). Before external deployment, add appropriate production origins.
- Authentication is done through a Supabase email magic link, not a hard-coded password.
- Missing Garmin metrics are shown as `–`. No synthesized HRV, medical clearance, or real coach recommendation.
- The `.env.local` file is ignored by Git. Only public keys go there.

## Install and configure

1. Unzip package into GARMIN_AI root on `feature/live-recovery-v0.4.1`.
2. Run `Install-LiveRecovery.ps1`. It edits only the known Coach page and footer, installs `@supabase/supabase-js@2`, performs a TypeScript/Vite build, writes public local client configuration and deploys the separate Cloud read endpoint. You will be asked for the Supabase **publishable key** (from Supabase Dashboard → Connect / API Keys) and the email address that will own all Garmin data.
3. In Supabase Dashboard → Authentication → URL Configuration add redirect URLs: `http://localhost:5173/**`, `http://localhost:5174/**`. This is needed before using email magic links; otherwise the link may redirect to another configured site.
4. Start `npm.cmd run dev` and navigate to Coach. Enter the **same owner email** and open the login link. Supabase must allow email auth; the first email login may create the user.
5. Select 7 or 30 days on Coach. 30-day view may only show 16 days until more history is synced. An 8-hour missing sleep metric is never silently fabricated; a missing day displays as missing.

## Troubleshooting

- `Login required` -> login first.
- `This account is not authorized for Garmin Health` -> email differs from secret or email not confirmed. Re-run installer using the correct owner email or update just that secret.
- `Origin not allowed` -> Vite must run on `localhost:5173–5179`; update CORS deliberately for other origins.
- Login link redirects to wrong host -> configure allowed Redirect URLs in Supabase Auth settings.
- `CORS failed` -> check function is deployed with `--no-verify-jwt`, but note the function itself ALWAYS verifies Supabase Auth JWT.

Version 0.4.1 is *private development only*. Do not deploy this frontend publicly without adding a production origin, HTTPS redirect and verified allowed user email.

# GARMIN_AI v0.3.0 | Supabase Foundation

Project: `eurgupsebxypjqvyizci` (https://eurgupsebxypjqvyizci.supabase.co)

## Scope

- Creates only three GARMIN_AI tables: `garmin_activities`, `garmin_daily_metrics` (reserved for later), `garmin_sync_runs`.
- RLS is enabled without public/authenticated read policies; public table grants revoked.
- Deploys a secret-protected, read-only Garmin integration (`sync-garmin`). It writes to the *new* database, not to Garmin.
- Synchronizes up to 10 recent Garmin activities and RPE/feeling for the newest one. No health sync yet.
- Does not change any EI Classic tables, and does not modify the React UI.
- Does NOT configure a scheduled sync or exposed browser data endpoint. Those are separate later steps.

## Security

- Garmin API key is read through PowerShell's hidden secure input.
- A second random sync secret is created and uploaded to Supabase.
- Both are transferred using an environment file in the Windows temp directory. The file is deleted in `finally`, whether the script succeeds or fails; it briefly exists in plaintext on local disk. This limitation is deliberate and preferable to putting secrets into process command lines.
- The temp file is never placed in the repository. No key or token is printed.
- No Git commit/push automatically occurs.
- Edge Function disables gateway JWT verification **only** because it verifies a separate 256-bit secret in the request before making any external or DB call. Do not remove that check.

## Installation

1. Download `GARMIN_AI_Supabase_v0.3.0.zip` to Downloads.
2. Run the full PowerShell block from ChatGPT. This creates a new feature branch and extracts this package into `garmin-ai`.
3. The script may open a browser for `supabase login`, and may prompt for the new project's database password during `supabase link`.
4. When asked for the Garmin key, paste into the hidden prompt. Never post it in chat.
5. Success prints the count saved in Supabase. Repeated sync is safe (upsert on activity ID).

## Supabase CLI

The setup script explicitly uses `npx.cmd --yes supabase@2` to avoid CLI v3 syntax differences, and uses `db push --dry-run` before `db push`. No Docker is required for deployment (`functions deploy --use-api`).

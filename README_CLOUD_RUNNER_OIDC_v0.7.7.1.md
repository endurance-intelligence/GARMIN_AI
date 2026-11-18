# GARMIN_AI v0.7.7.1 — Secretless GitHub Actions Cloud Audit

## Why

The Cloud Live Check has been confirmed by the user on 2026-11-06 at 20:00. The v0.7.7 strict read-only gear/calendar audit model and local tests have also passed. Running this only on the Windows PC would defeat the goal of reliable smartphone-first updates.

Use GitHub Actions **as a hosted ephemeral Node.js worker**, with all Garmin credentials still encrypted in Supabase Vault. Do NOT put a Supabase service-role key or Garmin OAuth tokens in GitHub secrets.

## Implementation

- `supabase/functions/garmin-cloud-worker/index.ts`: custom OIDC trust bridge using `jwtVerify` with GitHub's rotating remote JWKS, exact audience, issuer and RS256, then explicit claims validation:
  - Repository ID `1443154844` and repo `endurance-intelligence/GARMIN_AI`;
  - `refs/heads/main` and `ref_type=branch`;
  - exact workflow `.github/workflows/garmin-cloud-audit.yml@refs/heads/main`;
  - GitHub-hosted runner, only `workflow_dispatch` or `schedule`.
- GET retrieves the existing private Vault Garmin session and the **complete baseline snapshot** through Supabase's service-role key, held **only inside Supabase**. Never called from the browser.
- POST accepts **only** a version-checked token rotation of the Garmin OAuth envelope. It cannot write gear links, calendar, weight, or Garmin data.
- `scripts/cloud/audit-garmin-connect.mjs` requests short-lived GitHub OIDC token and calls Edge bridge from the Actions runner; queries gear including retired entries, all historical gear links and a bounded upcoming calendar window; prints counts/diffs only.
- `scripts/cloud/garmin-cloud-data-audit-model.mjs` now restricts calendar comparisons to the same date window. Incomplete gear scans are refused.
- `.github/workflows/garmin-cloud-audit.yml`: **manual-first** cloud job with 20-minute timeout, minimal permissions, concurrency serialization, a daily schedule which is **gated** by repository variable `GARMIN_CLOUD_AUDIT_ENABLED=true`. The variable must not be set until a successful manual cloud run.

## What to do next

1. On the development branch `feature/garmin-cloud-runner-oidc-v0.7.7.1`, run `node --test tests/garmin-worker-claims.test.mjs tests/garmin-cloud-data-audit.test.mjs tests/garmin-cloud-session.test.mjs` and `npm run build`.
2. Deploy only `garmin-cloud-worker` Edge Function with `--no-verify-jwt` (the Edge Function validates the signed GitHub OIDC JWT *itself*). The included `scripts/deploy-cloud-runner-oidc-v0771.ps1` performs the checks and deployment after confirmation. It requires that no migrations are pending.
3. **Review and merge the workflow into the repository default branch `main`.** GitHub only supports `workflow_dispatch` and `schedule` when the workflow file exists on the default branch. Pushing to the feature branch alone does not activate cloud runs. Do not merge unrelated unfinished features inadvertently.
4. On GitHub -> Actions -> **GARMIN_AI Cloud Read-Only Audit** -> Run workflow (main) for a **single manual test**. Verify the summary counts and differences. The job does not persist the new gear/calendar snapshot, even when a diff exists.
5. Once the manual read passes and errors/rate limits have been checked, enable automation using repo Settings -> Secrets and variables -> Actions -> Variables -> `GARMIN_CLOUD_AUDIT_ENABLED=true`. Schedule is 05:37 UTC daily (GitHub schedule is best effort and may be delayed). **Do not enable before validation.**

## Security

GitHub OIDC establishes a short-lived cryptographic identity. **No Garmin OAuth or Supabase service-role key is configured as a GitHub Secret.** The Edge function still returns a privileged Garmin OAuth session in memory to the *trusted* hosted GitHub runner. GitHub hosted execution and code on `main` therefore remain part of the trust boundary. The repository is currently public; never log the returned session or enable a job on unreviewed pull requests.

The Cloud bridge intentionally rejects normal browser Origin requests and any GitHub OIDC token issued for forks, PRs, other branches, or unrelated workflows.

## Not yet delivered

- Automatically **persisting** full gear/calendar changes: requires a complete-scan compare-and-swap, separate freshness timestamps, idempotent writes and per-job audit records.
- Self-service weight transfer to Garmin: requires first-read of existing Garmin weigh-in, safe pending/needs_review/confirmed outbox and read-back verification.
- Deploying React GARMIN_AI at a private HTTPS mobile URL.

This release is deliberately **read-only about Garmin data and GARMIN_AI snapshots**. It performs only OAuth token rotation in Vault if the upstream Garmin session is refreshed.

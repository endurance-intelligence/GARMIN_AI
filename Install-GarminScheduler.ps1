# GARMIN_AI 0.3.1 - deploy scheduled Garmin sync. No API keys are requested.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
$project = 'eurgupsebxypjqvyizci'
$branch = 'feature/garmin-scheduler-v0.3.1'
$cli = './node_modules/.bin/supabase.cmd'
$fn = './supabase/functions/sync-garmin/index.ts'
$migration = './supabase/migrations/20261103100000_garmin_scheduler.sql'
if ((git branch --show-current).Trim() -ne $branch) { throw "Wrong branch; expected $branch" }
if (-not (Test-Path $cli) -or -not (Test-Path $fn) -or -not (Test-Path $migration)) { throw 'CLI or scheduler files missing' }
if ((Get-Content $fn -Raw) -notmatch "garmin_verify_cron_token") { throw 'New Edge Function missing' }
if ((Get-Content $migration -Raw) -notmatch "garmin-ai-activities-every-3h") { throw 'Scheduler migration missing' }
Write-Host "`n=== GARMIN_AI 0.3.1 - SCHEDULER ===" -ForegroundColor Cyan
Write-Host "Zielprojekt: $project" -ForegroundColor Cyan
Write-Host "[INFO] First deploy the new authorization handler, then the migration."
& $cli functions deploy sync-garmin --project-ref $project --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Edge Function deploy failed' }
Write-Host "`n=== MIGRATION PREVIEW ===" -ForegroundColor Cyan
& $cli db push --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration preview failed' }
Write-Host "`n=== ENABLE VAULT + CRON + PG_NET ===" -ForegroundColor Cyan
& $cli db push --linked
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
Write-Host "`n[OK] Scheduler migration applied and initial request queued." -ForegroundColor Green
Write-Host '[INFO] Cron schedule: 15 */3 * * * (UTC). No secrets created on local disk.' -ForegroundColor Cyan
Write-Host '[INFO] Check GARMIN_AI sync logs in the Supabase dashboard after the initial request finishes.' -ForegroundColor Cyan
Write-Host "https://supabase.com/dashboard/project/$project/editor" -ForegroundColor Cyan

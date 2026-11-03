# GARMIN_AI v0.4.0 - Deploy separate daily Garmin health ingestion.
# Does not request or store API keys, does not alter existing activity sync.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
$project = 'eurgupsebxypjqvyizci'
$branch = 'feature/garmin-health-v0.4.0'
$cli = '.\node_modules\.bin\supabase.cmd'
$fn = '.\supabase\functions\sync-garmin-health\index.ts'
$migration = '.\supabase\migrations\20261103110000_garmin_health_scheduler.sql'
$config = '.\supabase\config.toml'
if ((git branch --show-current).Trim() -ne $branch) { throw "Unexpected Git branch (expected $branch)" }
foreach ($file in @($cli, $fn, $migration, $config)) {
  if (-not (Test-Path $file)) { throw "Missing file: $file" }
}
if ((Get-Content $fn -Raw) -notmatch 'garmin_verify_cron_token') { throw 'Missing cron authorization' }
$linkedRefFile = '.\supabase\.temp\project-ref'
if (-not (Test-Path $linkedRefFile)) { throw 'Supabase project not linked; setup link first' }
$linkedRef = (Get-Content $linkedRefFile -Raw).Trim()
if ($linkedRef -ne $project) { throw "Wrong Supabase project linked: $linkedRef" }
if ((Get-Content $migration -Raw) -notmatch 'garmin-ai-health-daily') { throw 'Missing health schedule' }

Write-Host "`n=== GARMIN_AI v0.4.0 HEALTH ===" -ForegroundColor Cyan
Write-Host "Supabase project: $project" -ForegroundColor Cyan

# Appends only this function config; leaves the existing sync-garmin settings as-is.
$configText = Get-Content $config -Raw
if ($configText -notmatch '(?m)^\[functions\.sync-garmin-health\]') {
  Add-Content -Path $config -Value "`n[functions.sync-garmin-health]`nverify_jwt = false`n"
  Write-Host '[OK] Health function config added' -ForegroundColor Green
}

Write-Host "`n=== DEPLOY HEALTH FUNCTION ===" -ForegroundColor Cyan
& $cli functions deploy sync-garmin-health --project-ref $project --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Health function deployment failed' }

Write-Host "`n=== MIGRATION PREVIEW ===" -ForegroundColor Cyan
& $cli db push --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration preview failed' }

Write-Host "`n=== SCHEDULE DAILY HEALTH IMPORT ===" -ForegroundColor Cyan
& $cli db push --linked
if ($LASTEXITCODE -ne 0) { throw 'Health migration failed' }

Write-Host "`n[OK] Health function deployed and first import queued!" -ForegroundColor Green
Write-Host '[INFO] Health cron: 25 6 * * * (UTC). Existing activities cron unchanged.'
Write-Host '[INFO] No secret files created or API keys requested.'
Write-Host "[INFO] Check health sync logs in Supabase SQL Editor: https://supabase.com/dashboard/project/$project/sql/new"

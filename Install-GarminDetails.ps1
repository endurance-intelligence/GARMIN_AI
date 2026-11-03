# GARMIN_AI v0.5.2 - deploy private, resumable activity details enrichment.
# No interactive API-key input and no Garmin writes.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

$project = 'eurgupsebxypjqvyizci'
$branch = 'feature/garmin-details-v0.5.2'
$cli = '.\node_modules\.bin\supabase.cmd'
$config = '.\supabase\config.toml'
$details = '.\supabase\functions\backfill-garmin-details\index.ts'
$sync = '.\supabase\functions\sync-garmin\index.ts'
$sql = '.\supabase\migrations\20261103143000_garmin_activity_details.sql'
$projectRefFile = '.\supabase\.temp\project-ref'

if ((git branch --show-current).Trim() -ne $branch) { throw "Falscher Branch: erwartet $branch" }
foreach ($path in @($cli, $config, $details, $sync, $sql, $projectRefFile)) {
    if (-not (Test-Path $path)) { throw "Datei fehlt: $path" }
}
if ((Get-Content $projectRefFile -Raw).Trim() -ne $project) {
    throw 'Supabase-Projekt passt nicht. Deployment gestoppt.'
}
if ((Get-Content $details -Raw) -notmatch 'garmin_detail_claim') {
    throw 'Detail-Funktion nicht korrekt vorhanden.'
}
if ((Get-Content $sync -Raw) -notmatch 'Preserve RPE/Feeling') {
    throw 'Sync-Funktion ohne RPE-Schutz. Deployment gestoppt.'
}

Write-Host "`n=== GARMIN_AI v0.5.2 - ACTIVITY DETAILS ===" -ForegroundColor Cyan
Write-Host "Supabase-Projekt: $project"
Write-Host '[INFO] Eine neue Tabelle, eine Edge Function und ein separater Cron-Job.'
Write-Host '[INFO] Keine Garmin-Schreibzugriffe und keine API-Schluessel im Browser.'

# Preserve other existing config sections. This function uses the existing Vault token.
$configFile = (Resolve-Path $config).Path
$source = [IO.File]::ReadAllText($configFile)
if ($source -notmatch '(?m)^\[functions\.backfill-garmin-details\]') {
    $source = $source.TrimEnd([char[]]@([char]13, [char]10)) + "`n`n[functions.backfill-garmin-details]`nverify_jwt = false`n"
    [IO.File]::WriteAllText($configFile, $source, [Text.UTF8Encoding]::new($false))
}

Write-Host "`n=== TYPESCRIPT + REACT BUILD ===" -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend-Build fehlgeschlagen' }

Write-Host "`n=== GARMIN SYNC (RPE-SCHUTZ) DEPLOY ===" -ForegroundColor Cyan
& $cli functions deploy sync-garmin --project-ref $project --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Sync-Function Deployment fehlgeschlagen' }

Write-Host "`n=== DETAIL EDGE FUNCTION DEPLOY ===" -ForegroundColor Cyan
& $cli functions deploy backfill-garmin-details --project-ref $project --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Detail-Function Deployment fehlgeschlagen' }

Write-Host "`n=== MIGRATION VORSCHAU ===" -ForegroundColor Cyan
& $cli db push --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration-Vorschau fehlgeschlagen' }

Write-Host "`n=== DETAIL TABELLE + SCHEDULER ERSTELLEN ===" -ForegroundColor Cyan
Write-Host "[INFO] Bestaetige nur, wenn Zielprojekt $project angezeigt wird."
& $cli db push --linked
if ($LASTEXITCODE -ne 0) { throw 'Migration fehlgeschlagen' }

Write-Host "`n[OK] GARMIN_AI v0.5.2 Deployment abgeschlossen!" -ForegroundColor Green
Write-Host '[INFO] Erster Detail-Import wurde eingereiht; erfolgreich gespeicherte Eintraege bitte im SQL Editor pruefen.'
Write-Host "https://supabase.com/dashboard/project/$project/sql/new"

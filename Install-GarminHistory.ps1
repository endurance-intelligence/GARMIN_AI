# GARMIN_AI v0.5.0 - install safe, paged, resumable historical backfill.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
$project = 'eurgupsebxypjqvyizci'
$branch = 'feature/garmin-history-v0.5.0'
$cli = '.\node_modules\.bin\supabase.cmd'
$config = '.\supabase\config.toml'
$fn = '.\supabase\functions\backfill-garmin-history\index.ts'
$sql = '.\supabase\migrations\20261103130000_garmin_history_backfill.sql'

if ((git branch --show-current).Trim() -ne $branch) { throw 'Falscher Git-Branch' }
foreach ($path in @($cli,$config,$fn,$sql)) { if (-not (Test-Path $path)) { throw "Datei fehlt: $path" } }
$refFile = '.\supabase\.temp\project-ref'
if (-not (Test-Path $refFile)) { throw 'Supabase nicht verknuepft; kein Deployment' }
if ((Get-Content $refFile -Raw).Trim() -ne $project) { throw 'Falsches Supabase-Projekt; kein Deployment' }

Write-Host "`n=== GARMIN_AI v0.5.0 FULL HISTORY ===" -ForegroundColor Cyan
Write-Host "Projekt: $project"
Write-Host '[INFO] Aktivitaetslisten seitenweise, 50 angefragt pro 5-Minuten-Takt.'
Write-Host '[INFO] Bestehende RPE- und Feeling-Werte bleiben erhalten.'

$text = [IO.File]::ReadAllText((Resolve-Path $config).Path)
if ($text -notmatch '(?m)^\[functions\.backfill-garmin-history\]') {
    $text = $text.TrimEnd([char[]]@([char]13,[char]10)) + "`n`n[functions.backfill-garmin-history]`nverify_jwt = false`n"
    [IO.File]::WriteAllText((Resolve-Path $config).Path, $text)
}

Write-Host "`n=== EDGE FUNCTION DEPLOY ===" -ForegroundColor Cyan
& $cli functions deploy backfill-garmin-history --project-ref $project --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Function-Deployment fehlgeschlagen' }

Write-Host "`n=== MIGRATION VORSCHAU ===" -ForegroundColor Cyan
& $cli db push --linked --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration-Vorschau fehlgeschlagen' }

Write-Host "`n=== MIGRATION AUSFUEHREN ===" -ForegroundColor Cyan
Write-Host '[INFO] Es werden neue Backfill-Funktionen und ein separater 5-Minuten-Cron-Job eingerichtet.'
& $cli db push --linked
if ($LASTEXITCODE -ne 0) { throw 'Migration fehlgeschlagen' }

Write-Host "`n[OK] Garmin History Import eingerichtet. Erste Seite wurde eingeplant." -ForegroundColor Green
Write-Host 'Fortschritt im Supabase SQL Editor mit folgender Abfrage pruefen:' -ForegroundColor Cyan
Write-Host 'SELECT status, next_offset, scanned_count, upserted_count, batch_count, last_error, completed_at FROM public.garmin_history_backfill_state;'
Write-Host "https://supabase.com/dashboard/project/$project/sql/new"

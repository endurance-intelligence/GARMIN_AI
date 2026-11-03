# GARMIN_AI v0.6.0 - first real Session Analyst (read-only).
# Extract this package into GARMIN_AI project root, then invoke this script.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
$project = 'eurgupsebxypjqvyizci'
$branch = 'feature/session-analyst-v0.6.0'
$cli = '.\node_modules\.bin\supabase.cmd'
$trainingPath = '.\src\pages\TrainingPage.tsx'
$configPath = '.\supabase\config.toml'
$readPath = '.\supabase\functions\read-garmin-session\index.ts'
$encoder = [Text.UTF8Encoding]::new($false)

if ((git branch --show-current).Trim() -ne $branch) { throw "Erwarteter Branch: $branch" }
foreach ($path in @($cli,$trainingPath,$configPath,$readPath,'.\src\components\LiveSessionAnalyst.tsx','.\src\lib\sessionAnalysis.ts','.\src\styles\session-live.css','.\supabase\.temp\project-ref')) {
  if (-not (Test-Path $path)) { throw "Fehlende Projektdatei: $path" }
}
if ((Get-Content '.\supabase\.temp\project-ref' -Raw).Trim() -ne $project) { throw 'Falsches Supabase-Projekt. Nichts deployed.' }

# Safely patch the existing page, keeping the rest of Horizon unchanged.
$training = [IO.File]::ReadAllText((Resolve-Path $trainingPath).Path)
$import = "import {LiveSessionAnalyst} from '../components/LiveSessionAnalyst'"
$anchorImport = "import {demoSessions} from '../data/demoSessions'"
if (-not $training.Contains($import)) {
  if (-not $training.Contains($anchorImport)) { throw 'TrainingPage Importstruktur unbekannt' }
  $training = $training.Replace($anchorImport, "$anchorImport`n$import")
}
$anchor = '<div className="v3-session-switch"'
$live = '<LiveSessionAnalyst active={active}/><div className="lsa-demo-divider">BEISPIELANALYSEN / DEMO - NOCH KEIN ABGLEICH MIT DEINEM TRAININGSPLAN</div>'
if (-not $training.Contains($live)) {
  if (-not $training.Contains($anchor)) { throw 'TrainingPage Struktur unbekannt. Abbruch.' }
  $training = $training.Replace($anchor, "$live$anchor")
}
$oldDisclaimer = 'ALLE AKTIVITÄTEN UND WERTE AUF DIESER SEITE SIND DEMODATEN. KEINE GARMIN-VERBINDUNG, KEINE GESUNDHEITSBEWERTUNG UND KEINE ÄNDERUNG AM TRAININGSPLAN.'
$newDisclaimer = 'DER LIVE SESSION ANALYST OBEN ZEIGT ECHTE GARMIN-MESSWERTE. DIE DARUNTERSTEHENDEN DREI ANALYSEN SIND WEITERHIN DEMO. KEINE AUTOMATISCHE ÄNDERUNG AM TRAININGSPLAN.'
$training = $training.Replace($oldDisclaimer,$newDisclaimer)

$config = [IO.File]::ReadAllText((Resolve-Path $configPath).Path)
if ($config -notmatch '(?m)^\[functions\.read-garmin-session\]') {
  $config = $config.TrimEnd([char[]]@([char]13,[char]10)) + "`n`n# Auth JWT verified inside this private function.`n[functions.read-garmin-session]`nverify_jwt = false`n"
}
$trainingOriginal = [IO.File]::ReadAllText((Resolve-Path $trainingPath).Path)
$configOriginal = [IO.File]::ReadAllText((Resolve-Path $configPath).Path)
try {
  [IO.File]::WriteAllText((Resolve-Path $trainingPath).Path,$training,$encoder)
  [IO.File]::WriteAllText((Resolve-Path $configPath).Path,$config,$encoder)
  Write-Host "`n=== GARMIN_AI v0.6.0 BUILD ===" -ForegroundColor Cyan
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen; Cloud Deployment wurde NICHT gestartet.' }
} catch {
  [IO.File]::WriteAllText((Resolve-Path $trainingPath).Path,$trainingOriginal,$encoder)
  [IO.File]::WriteAllText((Resolve-Path $configPath).Path,$configOriginal,$encoder)
  throw
}

Write-Host "`n=== PRIVATE SESSION API DEPLOY ===" -ForegroundColor Cyan
& $cli functions deploy read-garmin-session --project-ref $project --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Private Session API Deployment fehlgeschlagen' }
Write-Host "`n[OK] GARMIN_AI v0.6.0 lokal installiert und Endpoint deployed." -ForegroundColor Green
Write-Host '[INFO] Keine Datenbankmigration, keine neuen Secrets, keine Trainingsplan-Aenderung.'
Write-Host '[INFO] Mit npm.cmd run dev starten; Training oeffnen. Vor Git-Commit zuerst Live-Daten pruefen.'
git status --short --branch

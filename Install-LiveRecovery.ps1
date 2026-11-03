# GARMIN_AI v0.4.1 - changes only new recovery UI and deploys a separate read API.
# Uses existing Supabase project and keeps previous sync functions untouched.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$project = 'eurgupsebxypjqvyizci'
$target = 'feature/live-recovery-v0.4.1'
$cli = '.\node_modules\.bin\supabase.cmd'
$coachPath = Join-Path $root 'src\pages\CoachPage.tsx'
$appPath = Join-Path $root 'src\App.tsx'
$functionPath = Join-Path $root 'supabase\functions\read-garmin-health\index.ts'
$encoding = [Text.UTF8Encoding]::new($false)

if ((git branch --show-current).Trim() -ne $target) { throw 'Nicht auf dem v0.4.1 Feature-Branch.' }
if (-not (Test-Path $coachPath) -or -not (Test-Path $functionPath) -or -not (Test-Path $cli)) {
  throw 'GARMIN_AI Projekt oder Supabase CLI unvollstaendig.'
}

Write-Host "`n=== LIVE RECOVERY FRONTEND ===" -ForegroundColor Cyan
$coach = [IO.File]::ReadAllText($coachPath)
$anchor = "import {Icon} from '../components/Icon'"
$addedImport = "import {LiveRecovery} from '../components/LiveRecovery'"
if (-not $coach.Contains($addedImport)) {
  if (-not $coach.Contains($anchor)) { throw 'Coach Importstruktur unbekannt.' }
  $coach = $coach.Replace($anchor, "$anchor`n$addedImport")
}
$start = '<div className="section-title"><h3>Deine Signale</h3>'
$end = '<div className="lower-grid v3-lower-grid">'
if ($coach.Contains($start)) {
  $index1 = $coach.IndexOf($start)
  $index2 = $coach.IndexOf($end, $index1)
  if ($index2 -lt 0 -or $index2 -le $index1) { throw 'Coach-Metrikabschnitt nicht eindeutig.' }
  $coach = $coach.Substring(0, $index1) + '<LiveRecovery active={active} period={period}/>' + $coach.Substring($index2)
} elseif (-not $coach.Contains('<LiveRecovery active={active} period={period}/>')) {
  throw 'Coach-Seitenstruktur unbekannt; es wurde nichts ersetzt.'
}
$coach = [regex]::Replace($coach, '(?s)const trends = \{.*?\}\s*(?=export function CoachPage)', '')
$coach = $coach.Replace('BEISPIELWERTE', 'DEMO-SIGNAL')
[IO.File]::WriteAllText($coachPath, $coach, $encoding)

$app = [IO.File]::ReadAllText($appPath)
$app = $app.Replace('Nur illustrative Daten.<br/>Keine Garmin-Verbindung.<br/>Dein Plan bleibt unverändert.', 'Coach-Entscheidungen: Demo.<br/>Garmin Health: Live nach Login.<br/>Dein Plan bleibt unverändert.')
$app = $app.Replace('ILLUSTRATIVE DATA · NO LIVE GARMIN ACCESS', 'LIVE GARMIN HEALTH · COACH DECISIONS STILL DEMO')
[IO.File]::WriteAllText($appPath, $app, $encoding)

Write-Host "`n=== SUPABASE JS INSTALLIEREN ===" -ForegroundColor Cyan
& npm.cmd install --save '@supabase/supabase-js@2'
if ($LASTEXITCODE -ne 0) { throw 'NPM install fehlgeschlagen.' }

Write-Host "`n=== PRIVATE KONFIGURATION ===" -ForegroundColor Cyan
Write-Host 'Den publishable Key (sb_publishable_...) aus Supabase Connect/API Keys eingeben.' -ForegroundColor DarkGray
Write-Host 'NIEMALS einen sb_secret_ oder service_role Key hier eingeben!' -ForegroundColor Yellow
$publishable = (Read-Host 'Supabase PUBLISHABLE Key').Trim()
if ($publishable -cnotmatch '^sb_publishable_[A-Za-z0-9_-]{10,}$') { throw 'Nur ein Supabase sb_publishable_ Key ist erlaubt.' }
$owner = (Read-Host 'E-Mail fuer persoenlichen Garmin Health Login').Trim().ToLowerInvariant()
if ($owner -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' -or $owner.Contains('=')) { throw 'E-Mail-Adresse ungueltig.' }

# Dot-env contains a PUBLIC publishable key only; explicitly ignore it anyway.
$ignorePath = Join-Path $root '.gitignore'
$ignore = [IO.File]::ReadAllText($ignorePath)
if ($ignore -notmatch '(?m)^\.env\.local\s*$' -and $ignore -notmatch '(?m)^\.env\*\s*$') {
  [IO.File]::AppendAllText($ignorePath, "`n# GARMIN_AI local UI config`n.env.local`n", $encoding)
}
$envPath = Join-Path $root '.env.local'
$envContent = if (Test-Path $envPath) { [IO.File]::ReadAllText($envPath) } else { '' }
$envContent = [regex]::Replace($envContent, '(?m)^VITE_GARMIN_SUPABASE_(URL|PUBLISHABLE_KEY)=.*\r?\n?', '')
$envContent = $envContent.TrimEnd([char[]]@([char]13,[char]10)) + "`nVITE_GARMIN_SUPABASE_URL=https://$project.supabase.co`nVITE_GARMIN_SUPABASE_PUBLISHABLE_KEY=$publishable`n"
[IO.File]::WriteAllText($envPath, $envContent, $encoding)
$publishable = $null

Write-Host "`n=== BUILD PRUEFEN ===" -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen. Kein Cloud Deployment.' }

$secretTemp = Join-Path $env:TEMP ('garmin-owner-' + [guid]::NewGuid().ToString('N') + '.env')
try {
  [IO.File]::WriteAllText($secretTemp, "GARMIN_HEALTH_OWNER_EMAIL=$owner`n", $encoding)
  Write-Host "`n=== PRIVATE OWNER FREIGABE ===" -ForegroundColor Cyan
  & $cli secrets set --project-ref $project --env-file $secretTemp
  if ($LASTEXITCODE -ne 0) { throw 'Owner-Freigabe fehlgeschlagen.' }
} finally {
  $owner = $null
  if (Test-Path $secretTemp) { Remove-Item $secretTemp -Force }
}

# Track gateway configuration in project config. Actual authorization is done
# by auth.getUser(token) + confirmed owner email inside the function.
$configPath = Join-Path $root 'supabase\config.toml'
if (-not (Test-Path $configPath)) { throw 'Supabase config.toml fehlt.' }
$config = [IO.File]::ReadAllText($configPath)
if ($config -notmatch '(?m)^\[functions\.read-garmin-health\]') {
  [IO.File]::AppendAllText($configPath, "`n# JWT is validated inside read-garmin-health for publishable-key projects.`n[functions.read-garmin-health]`nverify_jwt = false`n", $encoding)
}

Write-Host "`n=== GESCHUETZTE READ FUNCTION DEPLOYEN ===" -ForegroundColor Cyan
# No legacy gateway JWT check: getUser() verifies Supabase Auth inside the function.
& $cli functions deploy read-garmin-health --project-ref $project --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Read Function Deployment fehlgeschlagen.' }

Write-Host "`n[OK] GARMIN_AI v0.4.1 Frontend und Cloud-Endpunkt eingerichtet!" -ForegroundColor Green
Write-Host "[INFO] Supabase Auth Redirect URLs: http://localhost:5173/** sowie http://localhost:5174/**" -ForegroundColor Yellow
Write-Host '[INFO] Dann npm.cmd run dev starten und auf Coach per E-Mail anmelden.' -ForegroundColor Cyan
Write-Host '[INFO] Keine Gesundheitsdaten wurden fuer anon/authenticated allgemein freigegeben.' -ForegroundColor DarkGray

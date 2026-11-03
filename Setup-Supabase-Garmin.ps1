# GARMIN_AI v0.3.0 - one-shot hosted Supabase project initialization
# Run only from GARMIN_AI's feature/supabase-v0.3.0 branch.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$projectRef = 'eurgupsebxypjqvyizci'
$branch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feature/supabase-v0.3.0') {
  throw 'Bitte nur auf feature/supabase-v0.3.0 ausfuehren.'
}
if (-not (Test-Path './supabase/config.toml') -or -not (Test-Path './supabase/functions/sync-garmin/index.ts')) {
  throw 'Supabase-Dateien fehlen. Bitte die ZIP vollstaendig entpacken.'
}
if (-not (Get-Command 'npx.cmd' -ErrorAction SilentlyContinue)) { throw 'npx.cmd fehlt.' }
if (-not (Get-Command 'curl.exe' -ErrorAction SilentlyContinue)) { throw 'curl.exe fehlt.' }

$gitignore = '.gitignore'
$existingIgnore = if (Test-Path $gitignore) { [IO.File]::ReadAllText((Resolve-Path $gitignore).Path) } else { '' }
$ignoreLines = @('supabase/.temp/', 'supabase/.branches/', 'supabase/.profiles/', 'supabase/.env', 'supabase/functions/.env')
$toAdd = @($ignoreLines | Where-Object { $existingIgnore -notmatch ('(?m)^' + [regex]::Escape($_) + '\r?$') })
if ($toAdd.Count -gt 0) {
  [IO.File]::AppendAllText((Join-Path $root $gitignore), "`r`n# GARMIN_AI private Supabase files`r`n" + ($toAdd -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($false))
}

Write-Host "`n=== GARMIN_AI v0.3.0 / SUPABASE ===" -ForegroundColor Cyan
Write-Host "Projekt: https://$projectRef.supabase.co"
Write-Host '[INFO] Supabase CLI v2 wird verwendet; es wird keine lokale Docker-Instanz benoetigt.' -ForegroundColor DarkGray

& .\node_modules\.bin\supabase.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI konnte nicht gestartet werden.' }

Write-Host "`n=== SUPABASE LOGIN ===" -ForegroundColor Cyan
Write-Host '[INFO] Folge ggf. der Anmeldung im Browser. Keine Zugangsdaten hier in ChatGPT senden.' -ForegroundColor DarkGray
& .\node_modules\.bin\supabase.cmd login
if ($LASTEXITCODE -ne 0) { throw 'Supabase Login fehlgeschlagen.' }

Write-Host "`n=== PROJEKT VERKNUEPFEN ===" -ForegroundColor Cyan
Write-Host '[INFO] Wenn die CLI nach dem Datenbankpasswort fragt, das Passwort deines neuen Projekts eingeben.' -ForegroundColor DarkGray
& .\node_modules\.bin\supabase.cmd link --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Supabase Projektverknuepfung fehlgeschlagen.' }

Write-Host "`n=== MIGRATION VORSCHAU (KEINE AENDERUNG) ===" -ForegroundColor Cyan
& .\node_modules\.bin\supabase.cmd db push --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Migration-Vorschau fehlgeschlagen. Nichts in der DB geaendert.' }

Write-Host "`n=== DATENBANKTABELLEN ERSTELLEN ===" -ForegroundColor Cyan
& .\node_modules\.bin\supabase.cmd db push
if ($LASTEXITCODE -ne 0) { throw 'Migration fehlgeschlagen. Details in der CLI-Ausgabe pruefen.' }

Write-Host "`n=== EDGE FUNCTION DEPLOY ===" -ForegroundColor Cyan
& .\node_modules\.bin\supabase.cmd functions deploy sync-garmin --project-ref $projectRef --no-verify-jwt --use-api
if ($LASTEXITCODE -ne 0) { throw 'Edge Function Deployment fehlgeschlagen.' }

# The CLI supports --env-file. A short-lived, per-user temp file is used
# rather than exposing secrets as process arguments or in PowerShell history.
$tempFile = Join-Path $env:TEMP ('garmin-ai-secret-' + [Guid]::NewGuid().ToString('N') + '.env')
$apiKey = $null
$syncSecret = $null
$secureValue = $null
try {
  Write-Host "`n=== GARMIN SECRETS HOCHLADEN ===" -ForegroundColor Cyan
  Write-Host '[INFO] Garmin API-Key wird verdeckt abgefragt. Nicht in den Chat senden.' -ForegroundColor Yellow
  $secureValue = Read-Host 'Garmin Personal API-Key' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try { $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($apiKey.Length -lt 20 -or $apiKey.Length -gt 2048 -or $apiKey -cnotmatch '^[A-Za-z0-9_+/.=-]+$') {
    throw 'Garmin-Key hat ein unerwartetes Format.'
  }
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $syncSecret = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
  [Array]::Clear($bytes, 0, $bytes.Length)
  $body = "GARMIN_API_KEY=$apiKey`nGARMIN_SYNC_SECRET=$syncSecret`n"
  [IO.File]::WriteAllText($tempFile, $body, [Text.UTF8Encoding]::new($false))
  $body = $null
  $apiKey = $null
  $secureValue = $null

  & .\node_modules\.bin\supabase.cmd secrets set --project-ref $projectRef --env-file $tempFile
  if ($LASTEXITCODE -ne 0) { throw 'Supabase Secrets konnten nicht hochgeladen werden.' }

  Write-Host "`n=== ERSTER GARMIN IMPORT ===" -ForegroundColor Cyan
  $url = "https://$projectRef.supabase.co/functions/v1/sync-garmin"
  $curlConfig = 'header = "x-garmin-sync-secret: ' + $syncSecret + '"'
  $responseLines = @($curlConfig | & curl.exe --config - --silent --show-error --max-time 90 --request POST --header 'Content-Type: application/json' --write-out "`n__HTTP_STATUS__:%{http_code}" $url)
  if ($LASTEXITCODE -ne 0) { throw 'Edge Function war per curl nicht erreichbar.' }
  $responseText = [string]::Join("`n", [string[]]$responseLines)
  $match = [regex]::Match($responseText, '(?m)__HTTP_STATUS__:(\d{3})\s*$')
  if (-not $match.Success) { throw 'Antwort ohne HTTP-Status.' }
  $httpCode = [int]$match.Groups[1].Value
  $jsonBody = $responseText.Substring(0, $match.Index).Trim()
  Write-Host "Edge Function HTTP: $httpCode"
  if ($httpCode -ne 200) {
    Write-Host "Antwort: $jsonBody" -ForegroundColor Yellow
    throw 'Garmin -> Supabase Import fehlgeschlagen (siehe Edge Function Logs).'
  }
  $result = $jsonBody | ConvertFrom-Json
  if ($result.ok -ne $true) { throw 'Garmin-Import lieferte kein ok=true.' }
  Write-Host "`n[OK] Echte Garmin-Aktivitaeten in Supabase gespeichert: $($result.stored)" -ForegroundColor Green
  Write-Host 'Tabellen: garmin_activities, garmin_daily_metrics, garmin_sync_runs' -ForegroundColor Green
  Write-Host 'Hinweis: Health-Metriken und Zeitplan folgen in einem spaeteren Schritt.' -ForegroundColor Cyan
} finally {
  $apiKey = $null
  $syncSecret = $null
  $secureValue = $null
  $curlConfig = $null
  if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue }
  Write-Host '[INFO] Temporaere Secret-Datei entfernt.' -ForegroundColor DarkGray
}

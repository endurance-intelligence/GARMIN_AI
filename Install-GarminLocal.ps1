$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$appFile = Join-Path $root 'src\App.tsx'
$viteFile = Join-Path $root 'vite.config.ts'
if (-not (Test-Path $appFile) -or -not (Test-Path $viteFile)) { throw 'Kein GARMIN_AI React/Vite Projekt gefunden.' }
$encoding = [System.Text.UTF8Encoding]::new($false)
$app = [System.IO.File]::ReadAllText($appFile)
if ($app -notmatch 'LiveGarminActivities') {
  $anchor = "import {TrainingPage} from './pages/TrainingPage'"
  if (-not $app.Contains($anchor)) { throw 'App.tsx Struktur unbekannt. Keine Dateien veraendert.' }
  $app = $app.Replace($anchor, "$anchor`nimport {LiveGarminActivities} from './components/LiveGarminActivities'")
  $slot = '<TrainingPage active={page===''training''} onGo={go}/>'
  if (-not $app.Contains($slot)) { throw 'Training Slot nicht gefunden. Keine Dateien veraendert.' }
  $app = $app.Replace($slot, "$slot`n      <LiveGarminActivities active={page==='training'}/>")
  [System.IO.File]::WriteAllText($appFile, $app, $encoding)
}
$vite = [System.IO.File]::ReadAllText($viteFile)
if ($vite -notmatch 'garminLocalApi') {
  if ($vite -notmatch 'plugins\s*:\s*\[\s*react\(\)\s*\]') { throw 'Vite Plugin Liste unbekannt. Vite-Datei nicht veraendert.' }
  $vite = "import { garminLocalApi } from './server/garminLocalApi'`n" + $vite
  $vite = [regex]::Replace($vite, 'plugins\s*:\s*\[\s*react\(\)\s*\]', 'plugins: [react(), garminLocalApi()]', 1)
  [System.IO.File]::WriteAllText($viteFile, $vite, $encoding)
}
Write-Host '[OK] Garmin Read-Only Adapter installiert (nur lokal / Vite).' -ForegroundColor Green
Write-Host '[INFO] API-Key wird nicht in einer Datei gespeichert.' -ForegroundColor Cyan

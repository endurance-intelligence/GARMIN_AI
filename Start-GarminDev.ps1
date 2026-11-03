$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Get-Command 'curl.exe' -ErrorAction SilentlyContinue)) { throw 'curl.exe nicht gefunden.' }
$key = Read-Host 'Garmin Personal API-Key (verdeckt eingeben)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
try {
  $env:GARMIN_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable key -ErrorAction SilentlyContinue
}
try {
  Write-Host '[INFO] GARMIN_AI startet lokal. Taste Strg+C zum Beenden.' -ForegroundColor Cyan
  npm.cmd run dev
} finally {
  Remove-Item Env:\GARMIN_API_KEY -ErrorAction SilentlyContinue
  Write-Host '[INFO] Garmin-Key aus der PowerShell-Umgebung entfernt.' -ForegroundColor Cyan
}

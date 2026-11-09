# GARMIN_AI v0.8.0 — mobile private web backend, no Garmin writes.
& {
  $ErrorActionPreference = 'Stop'
  $repo = 'C:\Users\a907985\work\GitProject\garmin-ai'
  $branch = 'feature/mobile-web-pages-v0.8.0'
  $projectRef = 'eurgupsebxypjqvyizci'
  Push-Location $repo
  try {
    Write-Host '=== GARMIN_AI v0.8.0: MOBILE WEB ===' -ForegroundColor Cyan
    if ((git branch --show-current) -ne $branch) { throw 'Falscher Branch.' }
    if (git status --porcelain) { throw 'Git-Arbeitsverzeichnis ist nicht sauber.' }

    Write-Host '=== TESTS ===' -ForegroundColor Cyan
    node --test .\tests\mobile-web-policy.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Tests fehlgeschlagen.' }

    Write-Host '=== PRODUKTIONS-BUILD ===' -ForegroundColor Cyan
    $oldPages = $env:GITHUB_PAGES
    try {
      $env:GITHUB_PAGES = 'true'
      npm.cmd run build
      $buildExit = $LASTEXITCODE
    } finally {
      if ($null -ne $oldPages) { $env:GITHUB_PAGES = $oldPages }
      else { Remove-Item Env:\GITHUB_PAGES -ErrorAction SilentlyContinue }
    }
    if ($buildExit -ne 0) { throw 'Build fehlgeschlagen.' }
    $html = Get-Content (Join-Path $repo 'dist\index.html') -Raw
    if ($html -notmatch '/GARMIN_AI/assets/') {
      throw 'Fehlerhafter Vite Base Path.'
    }

    Write-Host '=== SUPABASE PROJEKT PRUEFEN ===' -ForegroundColor Cyan
    $cli = Join-Path $repo 'node_modules\.bin\supabase.cmd'
    $refFile = Join-Path $repo 'supabase\.temp\project-ref'
    if (-not (Test-Path $cli) -or -not (Test-Path $refFile)) {
      throw 'Supabase CLI oder Projektverknuepfung fehlt.'
    }
    if ((Get-Content -LiteralPath $refFile -Raw).Trim() -ne $projectRef) {
      throw 'Falsches Supabase-Projekt.'
    }
    $oldPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $dry = @(& $cli db push --linked --dry-run 2>&1 |
        ForEach-Object { $_.ToString() })
      $dryExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldPreference }
    $dryText = $dry -join [Environment]::NewLine
    Write-Host $dryText
    if ($dryExit -ne 0 -or
        $dryText -notmatch '(?i)Remote database is up to date|No migrations to push|already up to date') {
      throw 'Datenbank nicht aktuell. Deployment gestoppt.'
    }
    $pending = @([regex]::Matches($dryText,'\b\d{14}_[A-Za-z0-9_]+\.sql\b') |
      ForEach-Object { $_.Value })
    if ($pending.Count -gt 0) {
      throw "Unerwartete Migrationen: $($pending -join ', ')"
    }

    $functions = @(
      'garmin-app-access',
      'read-garmin-session',
      'read-garmin-health',
      'garmin-connect-snapshot',
      'garmin-gear-image',
      'garmin-sync-center',
      'garmin-connect-cloud-check'
    )
    Write-Host '=== FREIGABE ===' -ForegroundColor Yellow
    Write-Host 'Nur Owner-authentifizierte APIs, keine Garmin-Schreibzugriffe.'
    $approved = Read-Host 'Mobile-Web-Funktionen deployen? ja eingeben'
    if ($approved.Trim() -ine 'ja') { throw 'Deployment nicht freigegeben.' }
    foreach ($functionName in $functions) {
      Write-Host "=== DEPLOY $functionName ===" -ForegroundColor Cyan
      try {
        $ErrorActionPreference = 'Continue'
        & $cli functions deploy $functionName --project-ref $projectRef --no-verify-jwt
        $result = $LASTEXITCODE
      } finally { $ErrorActionPreference = $oldPreference }
      if ($result -ne 0) { throw "Deployment fehlgeschlagen: $functionName" }
    }
    Write-Host '=== MOBILE BACKEND BEREIT ===' -ForegroundColor Green
    Write-Host 'Web-Login und private APIs bereit.'
    Write-Host 'GitHub Pages und Auth Redirect muessen noch aktiviert werden.'
    Write-Host 'Garmin-Cloud Rate-Limit und Gewicht-zu-Garmin bleiben offen.'
  } finally { Pop-Location }
}

# GARMIN_AI v0.7.6 - one-block-safe deployment of Vault foundation.
# Does NOT transfer Garmin OAuth tokens, run cloud worker or write to Garmin.
& {
    $ErrorActionPreference = 'Stop'
    $repo = 'C:\Users\a907985\work\GitProject\garmin-ai'
    $branch = 'feature/garmin-connect-cloud-foundation-v0.7.6'
    $projectRef = 'eurgupsebxypjqvyizci'
    $migration = '20261106193000_garmin_connect_cloud_session.sql'
    Push-Location $repo
    try {
        Write-Host "`n=== GARMIN_AI v0.7.6 VAULT FOUNDATION ===" -ForegroundColor Cyan
        if ((git branch --show-current) -ne $branch) { throw 'Falscher Branch.' }
        if (git status --porcelain) { throw 'Unsauberes Git-Arbeitsverzeichnis.' }

        Write-Host "`n=== TESTS ===" -ForegroundColor Cyan
        node --test .\tests\garmin-cloud-session.test.mjs .\tests\sync-health.test.mjs .\tests\weight-entry.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Tests fehlgeschlagen.' }

        Write-Host "`n=== BUILD ===" -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen.' }

        $cli = Join-Path $repo 'node_modules\.bin\supabase.cmd'
        $refFile = Join-Path $repo 'supabase\.temp\project-ref'
        if (-not (Test-Path $cli) -or -not (Test-Path $refFile)) {
            throw 'Supabase CLI oder Projektverknuepfung fehlt.'
        }
        if ((Get-Content -LiteralPath $refFile -Raw).Trim() -ne $projectRef) {
            throw 'Falsches Supabase-Projekt.'
        }
        Write-Host "`n=== DATENBANK DRY-RUN ===" -ForegroundColor Cyan
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $dry = @(& $cli db push --linked --dry-run 2>&1 |
                ForEach-Object { $_.ToString() })
            $dryExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousPreference }
        $text = $dry -join "`n"
        Write-Host $text
        if ($dryExit -ne 0 -or $text -notmatch 'Would push these migrations:') {
            throw 'Supabase Dry-Run fehlgeschlagen.'
        }
        $section = ($text -split 'Would push these migrations:', 2)[1]
        $section = ($section -split 'Finished supabase db push', 2)[0]
        $pending = @([regex]::Matches($section,'\b\d{14}_[A-Za-z0-9_]+\.sql\b') |
            ForEach-Object { $_.Value })
        if ($pending.Count -ne 1 -or $pending[0] -ne $migration) {
            throw "Unerwartete Migrationen: $($pending -join ', ')"
        }
        Write-Host "`n=== FREIGABE ===" -ForegroundColor Yellow
        $approval = Read-Host 'Nur Vault-Schema + Status-API deployen? ja eingeben'
        if ($approval.Trim() -ine 'ja') { throw 'Deployment nicht freigegeben.' }

        try {
            $ErrorActionPreference = 'Continue'
            & $cli db push --linked
            $dbExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousPreference }
        if ($dbExit -ne 0) { throw 'Vault-Migration fehlgeschlagen.' }

        try {
            $ErrorActionPreference = 'Continue'
            & $cli functions deploy garmin-sync-center --project-ref $projectRef --no-verify-jwt
            $apiExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousPreference }
        if ($apiExit -ne 0) { throw 'Status-API Deployment fehlgeschlagen.' }

        Write-Host "`n=== LOCALHOST FREIGEBEN ===" -ForegroundColor Cyan
        $owners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
        foreach ($serverPid in $owners) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
            if ($proc -and $proc.Name -eq 'node.exe' -and $proc.CommandLine -match 'vite') {
                Stop-Process -Id $serverPid -Force
                Write-Host "Vite beendet: $serverPid"
            } else { throw "Port 5173 gehoert nicht zu Vite: $serverPid" }
        }
        Start-Sleep -Seconds 2
        Write-Host "`n=== v0.7.6 GRUNDLAGE DEPLOYED ===" -ForegroundColor Green
        Write-Host 'Garmin Cloud OAuth-Speicher vorbereitet; keine Tokens uebertragen.'
        Write-Host 'Keine Garmin-Schreibzugriffe. Keine automatischen Cloud-Reads.'
        Write-Host "`n=== LOCALHOST STARTEN ===" -ForegroundColor Cyan
        npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
    } finally { Pop-Location }
}

# GARMIN_AI v0.7.6.2 - READ-ONLY Cloud Connect verification, no Garmin writes.
& {
    $ErrorActionPreference = 'Stop'
    $repo = 'C:\Users\a907985\work\GitProject\garmin-ai'
    $branch = 'feature/garmin-cloud-livecheck-v0.7.6.2'
    $ref = 'eurgupsebxypjqvyizci'
    $migration = '20261106200000_garmin_cloud_check_status.sql'
    Push-Location $repo
    try {
        Write-Host '=== GARMIN_AI v0.7.6.2 CLOUD LIVE-CHECK ===' -ForegroundColor Cyan
        if ((git branch --show-current) -ne $branch) { throw 'Falscher Git-Branch.' }
        if (git status --porcelain) { throw 'Git-Arbeitsverzeichnis ist nicht sauber.' }
        Write-Host '=== TESTS ===' -ForegroundColor Cyan
        node --test .\tests\garmin-cloud-check.test.mjs .\tests\garmin-connect-bootstrap.test.mjs .\tests\garmin-cloud-session.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Tests fehlgeschlagen.' }
        Write-Host '=== BUILD ===' -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript/Vite Build fehlgeschlagen.' }

        $cli = Join-Path $repo 'node_modules\.bin\supabase.cmd'
        $refFile = Join-Path $repo 'supabase\.temp\project-ref'
        if (-not (Test-Path $cli) -or -not (Test-Path $refFile)) {
            throw 'Supabase CLI oder Projektverknuepfung fehlt.'
        }
        if ((Get-Content $refFile -Raw).Trim() -ne $ref) {
            throw 'Falsches Supabase-Projekt.'
        }

        Write-Host '=== MIGRATION DRY-RUN ===' -ForegroundColor Cyan
        $old = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $raw = @(& $cli db push --linked --dry-run 2>&1 |
                ForEach-Object { $_.ToString() })
            $dryExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $old
        }
        $dryText = $raw -join [Environment]::NewLine
        Write-Host $dryText
        if ($dryExit -ne 0) { throw 'Dry-Run fehlgeschlagen.' }
        $pending = @(
            [regex]::Matches($dryText, '\b\d{14}_[A-Za-z0-9_]+\.sql\b') |
            ForEach-Object { $_.Value }
        )
        $apply = $false
        if ($pending.Count -eq 1 -and $pending[0] -eq $migration) {
            $apply = $true
            Write-Host "Verifizierte Migration: $migration" -ForegroundColor Green
        }
        elseif ($pending.Count -eq 0 -and
            $dryText -match '(?i)Remote database is up to date|No migrations to push|already up to date') {
            Write-Host 'Datenbank bereits aktuell.' -ForegroundColor Green
        }
        else {
            throw "Unerwartete Migrationen oder Dry-Run-Ausgabe: $($pending -join ', ')"
        }

        $approve = Read-Host 'Nur Cloud-Lese-Test API und Status installieren? ja eingeben'
        if ($approve.Trim() -ine 'ja') { throw 'Deployment nicht freigegeben.' }

        if ($apply) {
            Write-Host '=== DATABASE DEPLOY ===' -ForegroundColor Cyan
            try {
                $ErrorActionPreference = 'Continue'
                & $cli db push --linked
                $dbExit = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $old
            }
            if ($dbExit -ne 0) { throw 'Datenbankmigration fehlgeschlagen.' }
        }

        Write-Host '=== CLOUD LIVE-CHECK DEPLOY ===' -ForegroundColor Cyan
        try {
            $ErrorActionPreference = 'Continue'
            & $cli functions deploy garmin-connect-cloud-check --project-ref $ref --no-verify-jwt
            $checkExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $old
        }
        if ($checkExit -ne 0) { throw 'Cloud-Live-Check Deployment fehlgeschlagen.' }

        Write-Host '=== STATUS COCKPIT DEPLOY ===' -ForegroundColor Cyan
        try {
            $ErrorActionPreference = 'Continue'
            & $cli functions deploy garmin-sync-center --project-ref $ref --no-verify-jwt
            $statusExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $old
        }
        if ($statusExit -ne 0) { throw 'Sync-Cockpit Deployment fehlgeschlagen.' }

        Write-Host '=== ALTER LOCALHOST ===' -ForegroundColor Cyan
        $owners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
                    Select-Object -ExpandProperty OwningProcess -Unique)
        foreach ($serverPid in $owners) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
            if ($proc -and $proc.Name -eq 'node.exe' -and
                $proc.CommandLine -match 'vite') {
                Stop-Process -Id $serverPid -Force
                Write-Host "Alter Vite-Prozess beendet: $serverPid"
            } else {
                throw "Port 5173 belegt durch anderen Prozess: $serverPid"
            }
        }
        Start-Sleep -Seconds 2
        Write-Host '=== CLOUD CHECK BEREIT ===' -ForegroundColor Green
        Write-Host 'Kein Garmin-Schreibzugriff. Keine Tokenausgabe.'
        Write-Host 'Einstellungen -> Cloud-Verbindung testen anklicken.'
        npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
    } finally { Pop-Location }
}

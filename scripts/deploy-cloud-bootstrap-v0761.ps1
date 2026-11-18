# GARMIN_AI v0.7.6.1 -- safe tests/build/deploy; NEVER transfers Garmin tokens.
& {
    $ErrorActionPreference = 'Stop'
    $repo = 'C:\Users\a907985\work\GitProject\garmin-ai'
    $target = 'feature/garmin-connect-vault-bootstrap-v0.7.6.1'
    $projectRef = 'eurgupsebxypjqvyizci'
    $previousVaultMigration = '20261106193000_garmin_connect_cloud_session.sql'

    Push-Location $repo
    try {
        Write-Host '=== GARMIN_AI V0.7.6.1 ===' -ForegroundColor Cyan
        if ((git branch --show-current) -ne $target) {
            throw 'Falscher Git-Branch.'
        }
        if (git status --porcelain) {
            throw 'Arbeitsverzeichnis ist nicht sauber.'
        }

        Write-Host '=== REGRESSION TESTS ===' -ForegroundColor Cyan
        node --test .\tests\garmin-connect-bootstrap.test.mjs .\tests\garmin-cloud-session.test.mjs .\tests\sync-health.test.mjs .\tests\weight-entry.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Tests fehlgeschlagen.' }

        Write-Host '=== BUILD ===' -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen.' }

        Write-Host '=== SUPABASE PROJECT PRUEFEN ===' -ForegroundColor Cyan
        $cli = Join-Path $repo 'node_modules\.bin\supabase.cmd'
        $refFile = Join-Path $repo 'supabase\.temp\project-ref'
        if (-not (Test-Path $cli) -or -not (Test-Path $refFile)) {
            throw 'Supabase CLI oder Projektverknuepfung fehlt.'
        }
        if ((Get-Content -LiteralPath $refFile -Raw).Trim() -ne $projectRef) {
            throw 'Unerwartetes Supabase-Projekt.'
        }
        $oldPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $dry = @(& $cli db push --linked --dry-run 2>&1 | ForEach-Object { $_.ToString() })
            $dryExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $oldPreference
        }
        $dryText = $dry -join [Environment]::NewLine
        Write-Host $dryText
        if ($dryExit -ne 0) {
            throw 'Supabase Migration Dry-Run fehlgeschlagen.'
        }

        $pending = @(
            [regex]::Matches($dryText, '\b\d{14}_[A-Za-z0-9_]+\.sql\b') |
                ForEach-Object { $_.Value }
        )
        $applyVault = $false
        if ($pending.Count -eq 1 -and $pending[0] -eq $previousVaultMigration) {
            $applyVault = $true
            Write-Host 'Vorherige Vault-Migration steht noch aus.' -ForegroundColor Yellow
        }
        elseif ($pending.Count -eq 0 -and
                $dryText -match '(?i)Remote database is up to date\.|No migrations to push|Finished supabase db push|already up to date') {
            Write-Host 'Keine offene Migration.' -ForegroundColor Green
        }
        else {
            throw "Unerwartete Migrationen: $($pending -join ', ')"
        }

        $approval = Read-Host 'Cloud-Bootstrap-API deployen (ohne Tokenuebertragung)? ja eingeben'
        if ($approval.Trim() -ine 'ja') {
            throw 'Deployment nicht freigegeben.'
        }

        if ($applyVault) {
            Write-Host '=== VAULT MIGRATION DEPLOY ===' -ForegroundColor Cyan
            try {
                $ErrorActionPreference = 'Continue'
                & $cli db push --linked
                $migrationExit = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $oldPreference
            }
            if ($migrationExit -ne 0) {
                throw 'Vault-Migration fehlgeschlagen.'
            }
        }

        Write-Host '=== OWNER-ONLY BOOTSTRAP DEPLOY ===' -ForegroundColor Cyan
        try {
            $ErrorActionPreference = 'Continue'
            & $cli functions deploy garmin-connect-bootstrap --project-ref $projectRef --no-verify-jwt
            $bootstrapExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $oldPreference
        }
        if ($bootstrapExit -ne 0) {
            throw 'Bootstrap Edge Function Deployment fehlgeschlagen.'
        }

        Write-Host '=== STATUS API DEPLOY ===' -ForegroundColor Cyan
        try {
            $ErrorActionPreference = 'Continue'
            & $cli functions deploy garmin-sync-center --project-ref $projectRef --no-verify-jwt
            $statusExit = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $oldPreference
        }
        if ($statusExit -ne 0) { throw 'Sync Center Deployment fehlgeschlagen.' }

        Write-Host '=== ALTE VITE INSTANZ BEENDEN ===' -ForegroundColor Cyan
        $owners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
                    Select-Object -ExpandProperty OwningProcess -Unique)
        foreach ($serverPid in $owners) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
            if ($proc -and $proc.Name -eq 'node.exe' -and
                $proc.CommandLine -match 'vite') {
                Stop-Process -Id $serverPid -Force
                Write-Host "Alter Vite-Prozess beendet: $serverPid"
            } else {
                throw "Port 5173 ist von einem fremden Prozess belegt: $serverPid"
            }
        }
        Start-Sleep -Seconds 2

        Write-Host '=== V0.7.6.1 DEPLOYED ===' -ForegroundColor Green
        Write-Host 'Owner-only Vault Bootstrap API bereit.'
        Write-Host 'Noch KEINE Garmin-Tokens uebertragen.'
        Write-Host 'Noch KEINE automatischen Garmin Connect Reads/Writes.'
        Write-Host 'Jetzt in Einstellungen die einmalige Verbindung separat freigeben.'

        npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
    }
    finally { Pop-Location }
}

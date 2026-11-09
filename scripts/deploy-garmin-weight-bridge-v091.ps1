# GARMIN_AI v0.9.1 – install PRIVATE weight queue RPCs and Edge bridge.
# No Garmin API calls. No scheduler. No Garmin weight writes activated.
& {
    $ErrorActionPreference='Stop'
    $repo='C:\Users\a907985\work\GitProject\garmin-ai'
    $target='feature/garmin-weight-cloud-worker-v0.9.1'
    $ref='eurgupsebxypjqvyizci'
    Push-Location $repo
    try {
        if ((git branch --show-current) -ne $target) { throw 'Falscher Git-Branch.' }
        if (git status --porcelain) { throw 'Git-Arbeitsverzeichnis nicht sauber.' }
        Write-Host '=== WEIGHT SAFETY TESTS ===' -ForegroundColor Cyan
        node --test .\tests\garmin-weight-reconciliation.test.mjs .\tests\garmin-weight-delivery.test.mjs .\tests\garmin-weight-cloud-identity.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Weight-Safety-Tests fehlgeschlagen.' }

        Write-Host '=== PRODUCTION BUILD ===' -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen.' }

        $cli=Join-Path $repo 'node_modules\.bin\supabase.cmd'
        $refFile=Join-Path $repo 'supabase\.temp\project-ref'
        if (-not (Test-Path $cli) -or -not (Test-Path $refFile)) {
            throw 'Supabase CLI oder Projektverknuepfung fehlt.'
        }
        if ((Get-Content -LiteralPath $refFile -Raw).Trim() -ne $ref) {
            throw 'Falsches Supabase-Projekt.'
        }
        Write-Host '=== DATABASE DRY RUN ===' -ForegroundColor Cyan
        $oldPref=$ErrorActionPreference
        try {
            $ErrorActionPreference='Continue'
            $dry=@(& $cli db push --linked --dry-run 2>&1 |
                ForEach-Object { $_.ToString() })
            $dryCode=$LASTEXITCODE
        } finally { $ErrorActionPreference=$oldPref }
        $dryText=$dry -join [Environment]::NewLine
        Write-Host $dryText
        if ($dryCode -ne 0) { throw 'Supabase DB Dry Run fehlgeschlagen.' }
        $pending=@([regex]::Matches($dryText, '\b\d{14}_[A-Za-z0-9_]+\.sql\b') |
            ForEach-Object {$_.Value} | Select-Object -Unique)
        $expected='20261109131857_garmin_weight_delivery_safety_v090.sql'
        $unexpected=@($pending | Where-Object { $_ -ne $expected })
        if ($unexpected.Count -gt 0) { throw "Unerwartete Migrationen: $($unexpected -join ', ')" }
        if ($pending.Count -eq 0 -and
            $dryText -notmatch '(?i)Remote database is up to date|No migrations to push|already up to date') {
            throw 'Datenbankstatus unklar.'
        }
        Write-Host '=== FREIGABE ===' -ForegroundColor Yellow
        Write-Host 'Installiert private Single-Shot-Queue und OIDC-Bridge.'
        Write-Host 'Keine Garmin-Anfragen, kein Scheduler, keine Garmin-Schreibfreigabe.'
        $yes=Read-Host 'DB-Migration (falls offen) und Edge Function deployen? ja eingeben'
        if ($yes.Trim() -ine 'ja') { throw 'Deployment nicht freigegeben.' }
        if ($pending -contains $expected) {
            Write-Host '=== DB MIGRATION ===' -ForegroundColor Cyan
            try {
                $ErrorActionPreference='Continue'
                & $cli db push --linked --yes
                $pushCode=$LASTEXITCODE
            } finally { $ErrorActionPreference=$oldPref }
            if ($pushCode -ne 0) { throw 'DB Migration fehlgeschlagen.' }
        }
        Write-Host '=== EDGE BRIDGE ===' -ForegroundColor Cyan
        try {
            $ErrorActionPreference='Continue'
            & $cli functions deploy garmin-weight-worker --project-ref $ref --no-verify-jwt
            $deployCode=$LASTEXITCODE
        } finally { $ErrorActionPreference=$oldPref }
        if ($deployCode -ne 0) { throw 'Edge Deployment fehlgeschlagen.' }
        Write-Host '=== PRIVATE WEIGHT BRIDGE BEREIT (WRITE DISABLED) ===' -ForegroundColor Green
        Write-Host 'Nichts zu Garmin uebertragen. GitHub-Workflow bleibt manuell.'
        Write-Host 'GARMIN_WEIGHT_WRITES_ENABLED NICHT auf true setzen.'
    } finally { Pop-Location }
}

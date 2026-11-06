# GARMIN_AI v0.7.7.1: deploy strictly authenticated read-only cloud bridge.
# Does not register or run a GitHub Actions job. No database changes.
& {
    $ErrorActionPreference='Stop'
    $repo='C:\Users\a907985\work\GitProject\garmin-ai'
    $branch='feature/garmin-cloud-runner-oidc-v0.7.7.1'
    $projectRef='eurgupsebxypjqvyizci'
    Push-Location $repo
    try {
        Write-Host '=== GARMIN_AI v0.7.7.1 ===' -ForegroundColor Cyan
        if ((git branch --show-current) -ne $branch) { throw 'Falscher Branch.' }
        if (git status --porcelain) { throw 'Git-Arbeitsverzeichnis nicht sauber.' }

        Write-Host '=== TESTS ===' -ForegroundColor Cyan
        node --test .\tests\garmin-worker-claims.test.mjs .\tests\garmin-cloud-data-audit.test.mjs .\tests\garmin-cloud-session.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Tests fehlgeschlagen.' }

        Write-Host '=== BUILD ===' -ForegroundColor Cyan
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen.' }

        $cli=Join-Path $repo 'node_modules\.bin\supabase.cmd'
        $refFile=Join-Path $repo 'supabase\.temp\project-ref'
        if (-not (Test-Path $cli) -or -not (Test-Path $refFile)) {
            throw 'Supabase CLI oder Verknuepfung fehlt.'
        }
        if ((Get-Content -LiteralPath $refFile -Raw).Trim() -ne $projectRef) {
            throw 'Falsches Supabase-Projekt.'
        }

        Write-Host '=== MIGRATION DRY RUN ===' -ForegroundColor Cyan
        $oldPreference=$ErrorActionPreference
        try {
            $ErrorActionPreference='Continue'
            $raw=@(& $cli db push --linked --dry-run 2>&1 |
                ForEach-Object { $_.ToString() })
            $dryExit=$LASTEXITCODE
        } finally { $ErrorActionPreference=$oldPreference }
        $dryText=$raw -join [Environment]::NewLine
        Write-Host $dryText
        if ($dryExit -ne 0 -or
            $dryText -notmatch '(?i)Remote database is up to date|No migrations to push|already up to date') {
            throw 'Datenbank muss vor diesem rein funktionalen Update bereits aktuell sein.'
        }
        $pending=@([regex]::Matches($dryText,'\b\d{14}_[A-Za-z0-9_]+\.sql\b') |
            ForEach-Object { $_.Value })
        if ($pending.Count -ne 0) {
            throw "Unerwartete Migrationen: $($pending -join ', ')"
        }

        Write-Host '=== FREIGABE ===' -ForegroundColor Yellow
        $answer=Read-Host 'GitHub-OIDC-Cloud-Bridge deployen (ohne automatischen Lauf)? ja eingeben'
        if ($answer.Trim() -ine 'ja') { throw 'Deployment nicht freigegeben.' }

        Write-Host '=== EDGE FUNCTION DEPLOY ===' -ForegroundColor Cyan
        try {
            $ErrorActionPreference='Continue'
            & $cli functions deploy garmin-cloud-worker --project-ref $projectRef --no-verify-jwt
            $result=$LASTEXITCODE
        } finally { $ErrorActionPreference=$oldPreference }
        if ($result -ne 0) { throw 'Cloud-Worker Bridge Deployment fehlgeschlagen.' }

        Write-Host '=== V0.7.7.1 EDGE BRIDGE DEPLOYED ===' -ForegroundColor Green
        Write-Host 'Nur signierte GitHub-OIDC-Jobs vom main-Branch autorisiert.'
        Write-Host 'Kein Supabase-Service-Role-Key auf GitHub benoetigt.'
        Write-Host 'Noch KEIN automatischer Cloud-Job aktiv.'
        Write-Host 'Keine Garmin-Schreibzugriffe oder Snapshot-Ueberschreibungen.'
    } finally { Pop-Location }
}

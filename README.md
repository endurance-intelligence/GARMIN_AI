# GARMIN_AI

Coach-first Trainings-, Analyse- und Race-Prep-App für einen privaten Nutzer. Basierend auf React, TypeScript, Vite und Supabase. Garmin Personal API liefert primäre Aktivitäts- und Recovery-Daten; Intervals.icu ist für vereinbarte Trainingsübertragung und Abgleich vorgesehen.

**Web-App:** https://endurance-intelligence.github.io/GARMIN_AI/

## Entwicklungsumgebung

- `npm ci` installiert die geprüften Abhängigkeiten.
- `npm run dev` startet lokal Vite. Die öffentlichen Supabase-Clientwerte stehen in `VITE_GARMIN_SUPABASE_URL` und `VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY`. Service-Role-Schlüssel gehören niemals in diese Variablen.
- `node --test tests/*.test.mjs` führt sämtliche verfügbaren Tests aus.
- `GITHUB_PAGES=true npm run build` erstellt die für `/GARMIN_AI/` passende statische Website.

## Source of truth und Releases

Die gesamte Web-App einschließlich Styles, Tests, Supabase-Migrationen und CI liegt auf **main**. Änderungen laufen über einen Feature-Branch und einen Pull Request; PR-Checks testen den gesamten Stand. Erst nach bestandenem CI wird der gemergte **main**-Commit automatisch nach GitHub Pages ausgerollt. Es gibt keine hart codierte Release-Commit-ID und keine separaten alten Demo-Sourcen mehr im Default-Branch.

Das Deployen der Web-App führt keine Supabase-Migrationen und keine Garmin-/Intervals-Schreiboperationen aus. Datenbankänderungen werden gesondert mit geprüfter RLS-Migration angewendet. Cloud-Audit, Kalender- und Gewichts-Workflows sind eigenständige Workflows und bleiben erhalten.

Technische Details: [Release & Architektur](docs/RELEASE_PROCESS.md). Produkthistorie steht in den versionierten README-Dateien.

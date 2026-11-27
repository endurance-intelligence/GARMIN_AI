# GARMIN_AI — Release-Ablauf und Datenflüsse (P2 · 2026-11-18)

## Kanonischer Code

- `main` enthält die **tatsächliche produktive React-/TypeScript-App**, nicht eine ältere Demo.
- `.github/workflows/garmin-ai-mobile-web.yml` baut stets den aktiven Commit: Für PRs den vorgeschlagenen Merge-Stand; bei `push` auf `main` genau diesen Commit. **Keine `ref:`-SHA-Pins**.
- Der gesamte Testbestand (`node --test tests/*.test.mjs`) läuft vor dem Release. `npm run build` muss den gültigen GitHub-Pages-Pfad erstellen.
- Ein fehlgeschlagener Test oder Build blockiert die Pages-Veröffentlichung; der bisherige Produktionsstand bleibt online.
- Ein Rückrollen erfolgt über einen geprüften `git revert` in `main` mit erneutem CI, nicht durch nachträgliches Umhängen eines Release-Pins.
- Cloud-/Gear-Audit, Kalender- und Gewichts-Synchronisationsjobs bleiben getrennte, berechtigte Automationen und werden hier nicht umgeschrieben.

## Quelle und Verantwortlichkeit

| Daten | Kanonische Quelle | Verwendung |
| --- | --- | --- |
| Trainingsaktivitäten, Erholung, RPE | Garmin-Import bzw. persistierte Garmin-Daten | Coach, Analyse, Kalender |
| Trainingsplanung/Übertragung | GARMIN_AI Coach, explizite Freigabe vor Änderungen | Garmin bzw. Intervals.icu je Integration |
| Hauptziel/Wettkampf | `garmin-coach-goal` Funktion und Ziel-Datenbank | Goals; Race Prep liest das aktive Ziel |
| Rennablauf/KH/Stundenwerte | `public.garmin_race_strategy` | Race Prep, Runden- und Energiekalkulation |
| Gel-Produkte | `public.garmin_gel_catalog` (nur Lesen per Client) | Marken, Varianten, Hersteller-Nährwerte |
| Persönlicher Gel-Vorrat und Geschmack | `public.garmin_gel_inventory` (RLS pro User) | Verteilung nach Stückzahl/Prio; keine automatische Abbuchung |
| Gel-Getränke-KH und Koffein-Freigabe | `public.garmin_gel_plan_settings` pro Ziel | Gel-Plan für den aktuellen Wettkampf |
| Wetterdaten und gefühlte Temperatur | Wetter-Client/Forecast im `RacePage` | Race Prep Wetter/Wetterverlauf, keine erfundenen Werte |

### Datenfluss Race Prep

`Goal → RaceStrategyCard → RaceExecutionCard` (Runden, Pausen, Stundenwerte);
`Goal + Strategy → GelInventoryPlanner → gelTiming.mjs` (nur verfügbare Gels, prio-basiert);
`RaceForecastCompact → RacePage → RaceStrategyCard` (gefühlte Temperatur).

**Begrenzungen:** Der Gel-Vorschlag berechnet keine präzise Kalorienbilanz aus festen Lebensmitteln. Gel-Koffein ist per Default aus, geschützte Notfallgels werden nicht automatisch aufgebraucht; tatsächliche Einnahmen, Verträglichkeit und Verbrauch werden nicht vorgetäuscht. Keine Änderung des Trainingsplans ohne Freigabe.

## Rollout und Rückfall

1. Änderungen in Feature-Branch und PR; alle Tests und Pages-Build müssen grün sein.
2. PR nach `main` mergen; Deploy-Job startet erst nach erfolgreichem Verify.
3. GitHub Pages auf https://endurance-intelligence.github.io/GARMIN_AI/ prüfen.
4. Bei Fehlern: PR/Commit prüfen, gezielt Fehler beheben oder `git revert`, anschließend erneute Freigabe.
5. Supabase-Schema-Migrationen erfolgen gesondert mit RLS und Verifikation. Kein Service-Key im Browser.

**Warnung:** Ein älteres Commit außerhalb von `main` ist kein alternativer Produktionsstand. Nicht wieder mit fest codierten Feature-Commit-IDs deployen.

## Datenschutz und Security-Release-Gate (4C)

- Öffentliches Repository: ausschließlich Quellcode, synthetische Fixtures und allgemeine technische Dokumentation. Keine produktiven Aktivitäts-, Gesundheits-, Standort-, Konto-, Plan- oder Audit-Daten (auch keine aggregierten persönlichen Kennzahlen), weder in Commits noch PR-Texten, Test-Fixtures, Issues oder CI-Logs.
- Vor dem ersten Push den gesamten geplanten Diff einschließlich Dokumentation und Fixtures auf persönliche Daten und Zugangsdaten prüfen. Nachträgliches Löschen in einem weiteren Commit beseitigt keine Git-Historie.
- Der Produktionsbuild akzeptiert ausschließlich den festgelegten Supabase-Projektendpunkt und das moderne Publishable-Key-Format. Keine Service-Role-, Secret- oder Legacy-JWT-Schlüssel in der App.
- Die CI prüft die produktiven Edge-Reader mit anonymen und ungültigen Sessions sowie verweigerte direkte REST-Reads geschützter Tabellen. Ausschließlich GET, begrenzte Anfragen, keine privaten Antworten oder Zugangsdaten im Log. Erfolgreiche Datenantworten ohne Autorisierung und ungeklärte HTTP-Fehler blockieren die Veröffentlichung.
- Login per Magic Link/OTP; keine neue Benutzerregistrierung über die Anwendung. Passwort- oder Auth-Konfiguration nur über unterstützte Admin-Schnittstellen ändern und echten Magic-Link-Zugang vor einer Änderung verifizieren.

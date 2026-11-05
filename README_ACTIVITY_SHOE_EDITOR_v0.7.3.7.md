# GARMIN_AI v0.7.3.7 — Schuh einer einzelnen Laufaktivität bearbeiten

## Nutzerentscheidung

- **Equipment:** fünf aktive Laufschuhe wieder **alphabetisch nach Name** sortieren statt nach Kilometern.
- **Training > echter Session Analyst:** den von Garmin Connect tatsächlich zugeordneten Schuh anzeigen. Falls Garmin den Standard `Altra FWD VIA · Blue / White` automatisch zuweist, wird das als aktuelle Zuordnung angezeigt — nicht als hartcodierter Default.
- **Ändern:** alphabetische Auswahl der fünf aktiven Schuhe oder `Kein Schuh zugeordnet`, Bestätigungsdialog, *expliziter* Garmin-Connect-Schreibzugriff für **diesen einen Lauf**.
- **Keine Änderung des Garmin-Standardschuhs.** Es werden weder v2-Gear-Defaults noch Workouts verändert.
- **Garmin ist führend:** neue Zuordnung direkt per `garmin.getActivityGear(activityId)` lesen, nicht aus dem bis zu einem Tag alten Supabase-Snapshot raten.

## Architektur / Sicherheit

- `server/garminActivityShoeLocal.ts`: lokaler Vite-Adapter auf `/api/garmin-activity-shoe` mit Supabase-Owner-JWT-Verifikation über die bestehende private Snapshot-API. Bearbeitung ausschließlich über POST von localhost, mit vorherigem Vergleich `expectedGearId` mit dem Live-Zustand.
- **Garmin-Connect-Sitzung bleibt lokal** in `%LOCALAPPDATA%\GARMIN_AI\garmin-connect-tokens`. Keine Garmin-Passwörter oder Garmin-Tokens im Browser, GitHub oder Supabase.
- Der Garmin Connect Client `garminconnect-js@0.11.0` stellt `getActivityGear`, `addGearToActivity` und `removeGearFromActivity` bereit. Die Links werden mit Garmin **read back** verifiziert. Falls eine der sequenziellen Operationen fehlschlägt, erfolgt ein best-effort Rollback; der Nutzer muss anschließend Garmin erneut lesen.
- Nach bestätigtem Garmin-Write wird ein `mode:'activity-shoe'` an die vorhandene Owner-Only `garmin-connect-snapshot` Edge Function gesendet. Diese ersetzt nur die **Schuhlinks der einen Laufaktivität** in der bestehenden Snapshot-Zeile. Andere Gear-Links, Fotos, Kalender und FIT bleiben unverändert. Kilometer kommen weiterhin aus `garmin_activities`.
- Wenn Garmin erfolgreich war, aber die Supabase-Übernahme fehlschlägt, meldet die Oberfläche dies als **Teilerfolg** und empfiehlt die bestehende vollständige Schuhzuordnungs-Synchronisierung.

## Grenzen

- Das ist ein **gezielter Schreibzugriff auf Garmin Connect** mit Benutzerfreigabe, keine automatische Coach-Planänderung.
- Garmin erlaubt eine historische Zuordnung nur, wenn der `firstUseDate` des Schuhs nicht nach der Aktivität liegt. Ein solcher Garmin-Fehler darf keine Erfolgsmeldung auslösen.
- Die lokale Session-Ansicht zeigt aktuell die **letzten 40 Laufaktivitäten**. Pagination/Suche durch die gesamte Historie ist ein separater UX-Schritt.
- Die Garmin-Connect-Bibliothek ist inoffiziell. Die neue Schreibfunktion erfordert einen Live-Test mit einer bewusst ausgewählten Aktivität; vor der ersten erfolgreichen Bestätigung nicht als produktiv abnehmen.
- Fehlt die lokale Garmin-Sitzung, ist das Feature nicht verfügbar. Es speichert niemals bloß lokal einen vermeintlich neuen Schuh.

## Deployment

1. Sauberer Basisbranch `feature/gear-polish-sync-v0.7.3.6` -> `feature/activity-shoe-editor-v0.7.3.7`.
2. `node --test tests/garmin-activity-shoe.test.mjs tests/garmin-gear-sync.test.mjs`; `npm.cmd run build`.
3. Keine Datenbankmigration. Nur bestehende Edge Function `garmin-connect-snapshot` deployen (Projekt `eurgupsebxypjqvyizci`). Normale JWT-Verifikation eingeschaltet lassen.
4. Alten Vite-Prozess mit Strg+C beenden; Vite unter `http://127.0.0.1:5173/` starten.
5. **Training** öffnen, echte Laufaktivität im Session Analyst wählen. Dort `Laufschuh` ansehen. Nach `Ändern` einen aktiven Schuh auswählen und die angezeigte Garmin-Änderung ausdrücklich bestätigen.
6. Aktuelle Zuordnung erneut lesen und unter **Equipment** prüfen, ob der Kilometerstand der zwei betroffenen Schuhe entsprechend korrigiert ist.

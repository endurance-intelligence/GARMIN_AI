GARMIN_AI v0.2.0 - Erste lesende Garmin-Verbindung

Dieses Paket installiert einen reinen Entwicklungsadapter in Vite.
Kein API-Key wird gespeichert oder an den Browser uebertragen.

Ablauf:
1. ZIP ins bestehende GARMIN_AI-Projekt entpacken.
2. Install-GarminLocal.ps1 ausfuehren.
3. npm.cmd run build ausfuehren.
4. Start-GarminDev.ps1 starten, API-Key verdeckt eingeben.
5. Training-Seite oeffnen und ganz unten den Block LIVE / GARMIN ansehen.

WICHTIG:
- Alles andere (Coach/Analyst) bleibt Demo und wird nicht mit Live-Daten vermischt.
- Der Adapter funktioniert nur im lokalen Vite-Entwicklungsserver. Es ist noch keine produktive Backend-Integration.
- Fuenf letzte Aktivitaeten werden geladen; fuer die neueste auch RPE und Feeling, falls vorhanden.
- Kein API-Key, Token oder JSON wird auf Festplatte gespeichert.
- Bitte vor spaeterem Deployment auf eigene abgesicherte Serverinfrastruktur umstellen.
- Kein automatischer Git Commit/Push in diesem Patch.

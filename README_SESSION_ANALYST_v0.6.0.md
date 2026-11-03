# GARMIN_AI v0.6.0 — Session Analyst / Evidence First

Ziel: Erste, echte Verlaufsanalyse im bestehenden Horizon-Training-Tab (keine KI-Behauptungen aus Demowerten).

## Umfang
- Eigene, GET-only Edge Function `read-garmin-session` hinter Supabase Auth. Nur bestätigte `GARMIN_HEALTH_OWNER_EMAIL` darf lesen; service-role bleibt serverseitig. Kein Anon-Zugriff.
- Letzte 40 Laufaktivitäten aus `garmin_activities` auswählen. Je Aktivität bis zu 1800 bereits gespeicherte Messpunkte aus `garmin_activity_details`.
- Nur `i`, `hr`, `speed`, `distance`, `elapsed` zurückgeben, keine GPS-Koordinaten, keine Rohdaten-Dumps.
- Gemessener HF-Verlauf als Graph, Ø HF, Kilometer, Dauer, Verfügbarkeit und vorsichtige Segment-Vergleiche.
- Kein Urteil über Zielerfüllung ohne Trainingsplan/HF-Zonen, keine automatische Trainingsanpassung.
- Die Demo-Analysen bleiben darunter klar als Demo markiert.

## Installation
1. ZIP in den Ordner `garmin-ai` entpacken, neuen Branch `feature/session-analyst-v0.6.0` benutzen.
2. `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-SessionAnalyst.ps1` starten.
3. Das Skript baut zuerst React und deployed erst bei erfolgreichem Build. Projekt-Ref muss `eurgupsebxypjqvyizci` sein.
4. `npm.cmd run dev`, dann Training öffnen, bereits bestätigte Supabase-Anmeldung nutzen.

## Qualität/Limitierungen
- Tempo-/Drift-Bewertung verwendet nur plausible 1,2–8 m/s-Geschwindigkeitswerte und vergleicht gleichlange Messpunkteabschnitte (15–40% vs 60–85%).
- Das ist zunächst ein **Hinweis auf HF-Veränderung bei vergleichbarer Geschwindigkeit**, keine vollständige kardiovaskuläre Drift-/Effizienzformel. GPS/Höhenmeter/Temperatur fehlen; Messpunktverteilung kann variieren.
- < 80 gültige HF-Werte => keine Auswertung; ohne genügend plausible Tempo-Daten => keine Driftinterpretation.
- Kein Trainingseffekt, keine medizinischen Aussagen und keine Diagnose von Erkrankung aus Wearable-Daten.
- Keine SQL-Migration, kein Key-Eingriff, kein neues Secret, kein Schreibzugriff auf die Trainingseinheiten.

## Nächster Schritt
Nach erfolgreicher Live-Anzeige prüfen wir Trainingstyp und Datenqualität; danach können individuelle HF-Zonen, Runden, RPE (Skala validieren), Intervallwiederholungen und Coach-Kontext integriert werden.

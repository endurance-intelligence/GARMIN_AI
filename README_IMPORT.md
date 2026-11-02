# GARMIN_AI Horizon v0.3.1 · React-Migration

Entwickelt für das vorhandene Vite-React-TypeScript-Projekt unter
`C:\Users\a907985\work\GitProject\garmin-ai`.

## Installation

1. Vite-Server im Terminal mit Strg+C beenden.
2. ZIP nach `C:\Users\a907985\work\GitProject\garmin-ai` entpacken, vorhandene Dateien überschreiben.
3. In PowerShell:

```powershell
cd "C:\Users\a907985\work\GitProject\garmin-ai"
npm.cmd run build
npm.cmd run dev
```

Danach `http://localhost:5173/` öffnen.

## Inhalt

- `src/App.tsx`: Navigation, Shell, Seitensteuerung
- `src/pages/CoachPage.tsx`: Coach-Empfehlung und Zustimmung/Ablehnung
- `src/pages/TrainingPage.tsx`: Session Analyst, Trainingswechsel, Fueling-Demo
- `src/pages/{Race,Gear,Settings}Page.tsx`: weitere Horizon-Seiten
- `src/data/demoSessions.ts`: klar gekennzeichnete, lokale Demo-Szenarien
- `src/styles/horizon.css`: bewährter Horizon-v0.3-Look
- `src/components/Icon.tsx`: lokale SVG-Icons (keine externe UI-Bibliothek)

Weder Garmin-Daten noch API-Schlüssel enthalten. Freigaben sind nur lokale UI-Zustände, keine echte Kalendermodifikation.

## Nächste Entwicklungsschritte

Nach akzeptierter React-Baseline: getrennten serverseitigen Garmin-Adapter, dauerhafte Speicherung und Coach-Regeln planen; keine Secrets in `src` ablegen.

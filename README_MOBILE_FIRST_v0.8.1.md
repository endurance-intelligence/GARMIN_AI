# GARMIN_AI v0.8.1 — Mobile-First Layout Polish

## Ausgangslage

Die private GARMIN_AI-Webanwendung ist seit v0.8.0 über
https://endurance-intelligence.github.io/GARMIN_AI/
unter erfolgreicher Owner-Anmeldung erreichbar. Beim ersten Test über das
Smartphone meldete der Nutzer, dass die Oberfläche noch nicht vollständig
handytauglich ist.

## Änderungen

- Nur additive, am Ende importierte mobile CSS-Regeln. Keine Änderungen an
  Supabase Auth, Garmin API, Datenbanken, Cloud-Worker oder Benutzerrechten.
- 760 px und weniger: App-Inhalt darf korrekt auf die Viewport-Breite
  schrumpfen, Karten und Training/Coach-Spalten stehen in sinnvoller Reihenfolge.
- 420 px und weniger: kleinere Seiteneinzüge und Titel, besonders enge
  Felder und Equipment-Bildraster werden einspaltig.
- Kennzahlen grundsätzlich zweispaltig, nicht auf drei Mini-Spalten gepresst.
- Training-Demo-Chips auf kleinen Geräten horizontal scrollbar.
- Formulare mit 16 px Schriftgröße und großen Touchflächen, um insbesondere
  iOS-Safari-Zoom beim Fokus zu vermeiden.
- Bottom-Navigation als fünf gleich breite Touch-Tabs, inklusive
  `safe-area-inset-bottom`. Letzter Bildschirmbereich bleibt darüber erreichbar.
- Diagramme passen sich an die Kartenbreite an; Karteninhalte dürfen umbrechen.
- `tests/mobile-first-polish.test.mjs` überprüft responsive Regeln sowie
  unveränderte Zugangsprüfung.

## Auslieferung

Der standardmäßige GitHub-Pages-Workflow auf `main` checkt den App-Code
bewusst an einem gepinnten Release-Commit aus. Damit v0.8.1 tatsächlich
ausgeliefert wird, muss die neue Version in diesem Workflow gepinnt und
über einen gesonderten Review-PR auf main gebracht werden.

Ein erfolgreicher GitHub-Actions-Deploy ist zunächst nur ein **Build- und
Publikationsnachweis**. Die visuelle Smartphone-Abnahme ist noch erforderlich.

## Abnahme auf echtem Handy

1. Nach einem erfolgreichen GitHub-Pages-Deployment Seite frisch öffnen.
2. 320, 375 und 430 CSS-Pixel breite Geräte prüfen.
3. Keine horizontale Gesamtseiten-Scrollbewegung, keine überdeckten Karten.
4. Untere fünf Navigationselemente bequem antippbar, inklusive iPhone-Leiste.
5. Coach, Training, Equipment, Einstellungen mit lesbaren Metriken.
6. Formular für Gewicht eingeben — nur in Supabase speichern, **nicht** nach Garmin.
7. Logout und erneuter Magic-Link-Login unverändert funktional.
8. Garmin-Connect-OAuth-Refresh bleibt derzeit bei GitHub-Runs durch HTTP 429
   begrenzt; v0.8.1 löst das nicht.

## Weitere mobile Iteration

Nach der ersten Smartphone-Abnahme bei Bedarf gezielt Screenshots von den
problematischen Bereichen verwenden, statt pauschale CSS-Regeln
hinzuzufügen. Anschließend können „Zum Home-Bildschirm“, PWA-Metadaten
und dauerhaft offline-fähige statische App-Hülle separat geprüft werden.

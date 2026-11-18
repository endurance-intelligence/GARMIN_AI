# GARMIN_AI v0.8.0 — Smartphone HTTPS Web (GitHub Pages)

## Was diese Version leistet

Die React/Vite-Oberfläche ist über GitHub Pages unter
**https://endurance-intelligence.github.io/GARMIN_AI/** erreichbar,
**nachdem** die einmalige Pages-Konfiguration und der manuelle Deploy erfolgreich abgeschlossen sind.

- Die statische Website ist öffentlich downloadbar, aber die **private GARMIN_AI-Oberfläche wird im Produktions-Build erst nach serverseitiger Supabase-Owner-Prüfung gemountet**.
- `garmin-app-access` prüft das Supabase-JWT mit `auth.getUser`, die bestätigte E-Mail und `GARMIN_HEALTH_OWNER_EMAIL`; sie gibt keine Nutzerdaten zurück. Alle vorhandenen privaten Edge-APIs prüfen den Besitzer weiterhin selbst.
- Login via vorhandenes Supabase Magic Link; **keine automatische Registrierung** (`shouldCreateUser:false`); Rücksprungadresse enthält `/GARMIN_AI/`.
- Bestehende private Browser-APIs akzeptieren zusätzlich ausschließlich die HTTPS-Origin `https://endurance-intelligence.github.io`. Kein Wildcard-CORS und keine Service-Key-Freigabe an den Browser.
- Vite setzt im GitHub-Pages-Build `base:'/GARMIN_AI/'`; localhost bleibt unverändert.
- Mobile Navigation und responsive Oberflächen bleiben erhalten. Die lokale Garmin-Connect-Schuhbearbeitung, lokale Gear-Synchronisierung und lokaler Token-Bootstrap werden **im gehosteten Produktions-Build nicht angeboten**.
- Browserfunktionen mit owner-authentifizierten Supabase-APIs bleiben erhalten: Session Analyst, Recovery/Health, gespeicherte Ausrüstung inklusive privater Bilder, Kalender-Snapshot, Sync-Cockpit und Gewichtserfassung (Status `pending`).
- Viele Coach-/Race-/Fueling-Karten bleiben **explizit Demo**, werden nicht als echte Garmin-Analyse ausgegeben.

## EINMALIGE EINRICHTUNG — drei getrennte Schritte

### 1. Private Backend-APIs deployen

Auf `feature/mobile-web-pages-v0.8.0`:
`node --test tests/mobile-web-policy.test.mjs`, `npm run build`,
danach `scripts/deploy-mobile-web-v080.ps1`.
Der Deploy-Script prüft Projekt `eurgupsebxypjqvyizci`, fordert ausdrückliche Zustimmung und aktualisiert:
`garmin-app-access`, `read-garmin-session`, `read-garmin-health`,
`garmin-connect-snapshot`, `garmin-gear-image`, `garmin-sync-center`,
`garmin-connect-cloud-check`.

**Kein** Datenbank-Schemawechsel, kein OAuth-Refresh, keine Garmin-Connect-Schreibfunktion. Edge Functions werden mit `--no-verify-jwt` deployed, weil jede von ihnen das echte Supabase-Benutzer-JWT **im Funktionscode** und den bestätigten Besitzer selbst validiert.

### 2. Supabase Auth Rücksprungadresse

Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:

```text
https://endurance-intelligence.github.io/GARMIN_AI/
```

Es muss eine **exakte HTTPS-Adresse** sein, keine Wildcard.
Die bereits eingerichteten localhost Redirects behalten.
Der `Site URL`-Standard kann nach erfolgreichem Test bei Bedarf auf
`https://endurance-intelligence.github.io/GARMIN_AI/` gestellt werden,
damit Passwort-/Login-Links standardmäßig hierhin zurückkehren.
Magic-Link-E-Mail-Templates dürfen `RedirectTo` nicht unbeabsichtigt durch `SiteURL` überschreiben.

### 3. GitHub Pages aktivieren und den manuellen Build starten

GitHub Repo → Settings → Secrets and variables → Actions → **Variables**
→ New repository variable:

Name `GARMIN_SUPABASE_PUBLISHABLE_KEY`; Wert der **PUBLIC / publishable**
Key aus Supabase Dashboard → Project Settings → API Keys.
*Nie* einen `service_role`, `sb_secret_...`, OAuth- oder Garmin-Token nutzen!
Der Browser-Key ist bewusst öffentlich; die privaten Daten sind hinter Supabase Auth/RLS/Owner-APIs.

GitHub Repo → Settings → Pages → Build and deployment → **Source: GitHub Actions**.

Nach Review den separaten **Pages-only Workflow PR** in `main` mergen.
Dann GitHub → Actions → **GARMIN_AI Mobile Web** → Run workflow → `main`.

Diese Workflow-Datei baut **genau den geprüften v0.8.0-Code per gepinntem Commit SHA**, statt den alten `main` App-Stand oder alle Entwicklungs-Branches ungeprüft zusammenzumergen. Sie nutzt Node 24, installiert per `npm ci`, testet die mobile Policy und baut für GitHub Pages mit `GITHUB_PAGES=true`. Deployment erfolgt als Pages-Artifact. Die Variable ist im ausgelieferten JS zwangsläufig sichtbar; das ist für Supabase publishable keys vorgesehen.

## Abnahmetest (vom Handy ohne laufenden PC)

1. `https://endurance-intelligence.github.io/GARMIN_AI/` über Mobilfunk öffnen.
2. Ohne Login: Nur private Login-Seite; keine Garmin- oder Demodashboards sichtbar.
3. Login-Link zum bereits freigegebenen Supabase-Konto: genau nach `/GARMIN_AI/` zurückkehren und Owner-Prüfung bestehen.
4. Coach: Health-Daten und Gewichtseintrag testen (Gewicht wird nur in Supabase gespeichert, *nicht* nach Garmin geschickt).
5. Training: Session Analyst, HF-Daten, Kalender-Snapshot; keine lokale Schuhschreibfunktion.
6. Equipment: aktive Schuhe und Bilder anzeigen; fehlende CORS- oder Login-Fehler beheben.
7. Settings: Sync-Cockpit / FIT, Ausrüstung und Kalender als manuell kennzeichnen.
8. In einem fremden Browser ohne Auth und mit nicht freigegebenem Konto: privater Datenzugriff verweigert.
9. GARMIN_AI darf **nicht** von einem lokalen Windows-Webserver abhängig sein.

## Offene Themen

- Automatische Garmin Connect Token-Erneuerung aus GitHub Cloud derzeit HTTP 429. **Keine weiteren automatischen Retry-Schleifen**.
- Ausrüstung und Garmin-Kalender bislang nur manuell / gespeicherter Snapshot.
- Gewicht wird erfasst, aber **noch nicht** verifiziert nach Garmin übertragen.
- Coach, Race Prep und Fueling noch zu großen Teilen Demo bzw. erst konzipiert.
- PWA-/Homescreen-Installation, Push und Offline-Betrieb separat nach erfolgreicher HTTPS-Abnahme.

## Sicherheitsgrenze

GitHub Pages hostet eine **öffentlich abrufbare statische Website**. Es ist kein geschlossener Webhost und schützt die JS-Dateien selbst nicht. Benutzer-, Garmin- und Gewichtsdaten sind ausschließlich durch Supabase Auth, Row Level Security und überprüfte serverseitige APIs geschützt. VITE-Publishable-Key ist **kein Secret**. Den Service-Role-Key niemals in GitHub Actions, Vite, GitHub Pages, Logs oder Chat kopieren.

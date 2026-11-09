# GARMIN_AI v0.9.0 – sichere Gewichtsübertragung vorbereiten

## Stand 09.11.2026

Der iPhone-/iPad-Browser speichert Gewichtseinträge bereits in Supabase
`garmin_weight_outbox`, zunächst mit Status `pending`. Übertragung nach
Garmin Connect ist **noch nicht aktiv**.

Der zuletzt getestete Cloud-Garmin-OAuth-Refresh auf GitHub Actions scheiterte
mit **HTTP 429 (rate-limited)**. Es werden bewusst keine neuen Garmin-Anfragen
aus CI oder bei Installation dieses Releases gesendet.

## Bereits umgesetzte Bausteine (nur Entwicklungsbranch, nicht deployed)

1. `scripts/cloud/garmin-weight-reconciliation.mjs`: reine
   Normalisierung und strikt lesender Vergleich. Garmin schreibt numerische
   Kilogramm, liefert bei `getDailyWeighIns` aber Gramm: `77500 g = 77,5 kg`.
   Ohne **valide und vollständige Garmin-Tagesansicht** wird nie geschrieben.
   Bestehende Gewichtswerte, Mehrfachmessungen oder widersprüchliche
   Tageswerte stoppen die automatische Verarbeitung.
2. `scripts/cloud/garmin-weight-delivery.mjs`: injizierbarer Ablauf mit
   `writesEnabled=false` als festem Standard. Einziges mögliches Schreibziel
   ist `garmin.addWeighIn(kg, 'kg', ausgewähltes Datum)`, nur nach
   `getDailyWeighIns` (null Einträge) und einem atomaren DB-Claim.
   Danach **gleicher Tag** neu lesen; eine erfolgreiche POST-Antwort allein ist
   keine Bestätigung. Bei unklarer Antwort → `needs_review`, kein Auto-Retry.
   Auch eine bereits vorhandene eindeutig passende Messung wird nicht erneut
   geschrieben, sondern erst mit eindeutiger Prüfung als bestätigt markiert.
3. `supabase/migrations/20261109140000_garmin_weight_delivery_safety.sql`:
   Service-Role-only RPCs für sichere Prüfung, ein einziges Claim-Token,
   CAS-Vergleich von Datum/Gewicht/`updated_at`, irreversible Trennung
   `pending → sending → confirmed|needs_review`. **Migration noch nicht
   ausgerollt**.
4. Unit-Tests: echte Gramm-/kg-Asymmetrie, 0,1-kg-Grenzen, doppelte
   Tagesmessungen, 429 vor und während eines Writes, Netzwerkfehler,
   erfolglose 2xx ohne Read-back, konkurrierende Datenbankänderungen.
   Die Tests arbeiten nur mit Fakes und **kontaktieren Garmin nie**.

## Noch ausstehend

- Migration nach Review auf das exakt richtige Supabase-Projekt deployen.
- Den Node-Worker mit service-role-freier GitHub-OIDC-Gateway-Anbindung für
  **gezielt eingeschränkte** Weight-RPCs ergänzen. Die bisherige Cloud-Bridge
  erlaubt ausschließlich die Garmin-Audit-OAuth-Sitzung und Token-Rotation.
  Sie wird in v0.9.0 **nicht** erweitert.
- Sicherheitsgate für automatische Gewichts-Schreibzugriffe: separate
  owner-autorisierte Freigabe, pausierbare Queue, höchstens 1 Versuch pro
  Gewicht, 429-Cooldown ohne blindes Retries, und kein Personal API-Key im Browser.
- Cloud-OAuth-Refresh erst dann weiterverfolgen, wenn 429 abgeklungen ist;
  GitHub-Runner/IP als mögliche Ursache getrennt testen, keine SSO-
  Neuanmeldung im Endlosversuch.
- Einmaligen explizit freigegebenen echten Schreibtest durchführen und im
  Garmin-Connect-Konto persönlich bestätigen.
- Erst nach nachgewiesenem Write und Read-back den täglichen Scheduler
  erlauben und UI-Status `confirmed` real anzeigen.
- Bei EU-Garmin-Konten kann ein Schreibversuch trotz gültiger Tokens mit
  412 (Upload Consent) scheitern; ggf. in Garmin Connect selbst freigeben.

## Sicherheits- und Produktgrenzen

- **Kein automatischer Garmin-Schreibzugriff**, kein Cron, keine externen
  Tokens/Keys in Repository oder GitHub CI.
- Ein in Supabase gespeichertes Gewicht ist nicht automatisch in Garmin.
- Alle Datenmodell-Funktionen laufen serverseitig. Browser erhält niemals
  Supabase service_role oder Garmin OAuth-Tokens.
- Bei ungewissem Schreibstatus niemals automatisch erneut schreiben
  (Garmin könnte die erste Anforderung bereits verarbeitet haben).
- Die aktuelle iPhone-/iPad-Oberfläche (v0.8.5) und die vorhandenen
  Garmin Personal API Imports bleiben unverändert.

Garmin-Bibliothek: `garminconnect-js@0.11.0` (inoffizielle API).
Methoden: `getDailyWeighIns(date)` und `addWeighIn(kg, 'kg', when)`.

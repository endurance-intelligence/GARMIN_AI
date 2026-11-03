# GARMIN_AI v0.5.2 – Garmin Activity Details

## Ziel

Der bisherige `v0.5.0`-Import importiert **AktivitätsLISTEN**. `v0.5.2` ergänzt die gespeicherten Aktivitäten separat um Details aus Garmin Personal API, ohne das bestehende Horizon-Design anzufassen.

Pro 5-Minuten-Takt werden **höchstens zwei Aktivitäten** bearbeitet. Der Cron läuft in Minute 2, 7, 12 … und damit zeitversetzt zum bestehenden historischen 5-Minuten-Importer.

### Abgerufene Daten

- `GET /activity-service/activity/{id}`: Zusammenfassung, Anstrengung (`directWorkoutRpe`) und Gefühl (`directWorkoutFeel`) **als Garmin-Rohwerte** (keine 1–10-Deutung), Training Effect und falls vorhanden Garmin Activity Training Load.
- `GET /activity-service/activity/{id}/details?maxChartSize=1800&maxPolylineSize=0`: maximal 1.800 **ausgedünnte** Messpunkte inklusive HF, Zeit, Tempo-/Speed-Rohwert, Distanz, Kadenz und Höhe, jeweils zusammen mit den Garmin-Metrikbeschreibungen.
- `GET /activity-service/activity/{id}/laps`: Rundenwerte (Dauer, Strecke, HF, Speed, Kadenz).
- `GET /activity-service/activity/{id}/hrTimeInZones`: optional verfügbare HF-Zonenzeiten.
- Für passende Kraft-/Stabi-Aktivitäten `GET /activity-service/activity/{id}/workouts`: hinterlegte Trainingsstruktur, wenn verfügbar.

**Keine GPS-Koordinaten oder Polylines** werden im neuen Detail-Speicher abgelegt. Der Import ist rein lesend. Nicht für jede Sportart und jeden Personal-API-Key funktionieren alle optionalen Endpunkte; verfügbare Teildaten werden dann als `partial` gespeichert. Wir erfinden keine fehlenden Daten.

Der vollständige FIT-Rohdatenimport und die physiologische Bewertung (z. B. HF-Zonen, Cardiac Drift, Intervallqualität) gehören in spätere Schritte – die Rohwerte sind zunächst ausdrücklich **noch nicht** normiert.

### Sicherer Ablauf

- Neue Tabelle `public.garmin_activity_details`, mit aktivierter RLS und gesperrtem Direktzugriff für `anon` und `authenticated`.
- Serverseitige `SECURITY DEFINER`-RPCs sind nur für `service_role` ausführbar.
- Ein vorhandener Supabase-Vault-Token schützt den neuen Edge-Function-Aufruf; keine neuen Schlüssel, keine Anmeldung erforderlich.
- Claim/Lease und Retry-Backoff verhindern Doppelbearbeitung und ermöglichen Wiederaufnahme.
- `paused` nach fünf fehlgeschlagenen Versuchen pro Aktivität, `unavailable` bei dauerhaft fehlender Garmin-Zusammenfassung.
- Der bisherige `sync-garmin`-Job wird so angepasst, dass seine 3-stündlichen Upserts nachträglich importierte RPE-/Feeling-Werte und `summaryDTO` nicht wieder mit `NULL` bzw. einer Listen-Zusammenfassung überschreiben.

### Prüfen im Supabase SQL Editor

```sql
SELECT
  (SELECT COUNT(*) FROM public.garmin_activities) AS activity_count,
  COUNT(*) AS detail_jobs,
  COUNT(*) FILTER (WHERE status IN ('complete','partial')) AS enriched,
  COUNT(*) FILTER (WHERE status = 'complete') AS complete,
  COUNT(*) FILTER (WHERE status = 'partial') AS partial,
  COUNT(*) FILTER (WHERE status IN ('queued','processing','retry')) AS pending,
  COUNT(*) FILTER (WHERE status = 'paused') AS paused,
  COUNT(*) FILTER (WHERE status = 'unavailable') AS unavailable,
  COUNT(*) FILTER (WHERE hr_sample_count > 0) AS with_hr,
  COUNT(*) FILTER (WHERE lap_count > 0) AS with_laps,
  MAX(fetched_at) AS last_detail_utc
FROM public.garmin_activity_details;

SELECT jobname, active, schedule
FROM cron.job
WHERE jobname = 'garmin-ai-details-every-5min';

SELECT status, COUNT(*) AS activities, MAX(last_error) AS example_error
FROM public.garmin_activity_details
GROUP BY status ORDER BY status;
```

**Wichtig:** `active = true` in `cron.job` heißt lediglich, dass der Zeitplan aktiv ist. Der Detailimport gilt erst als getestet, wenn `enriched > 0` und die HF-/Rundenzähler entsprechend sinnvoll gefüllt sind. Die neue Tabelle bleibt vorerst für den Browser unzugänglich.

### Voraussetzung

Projekt `eurgupsebxypjqvyizci`, bestehende `v0.5.1`-Codebasis auf `main`, lokal installiertes Supabase CLI 2.x, Supabase-Projekt bereits verknüpft. Installation auf `feature/garmin-details-v0.5.2`, nicht direkt auf `main`.

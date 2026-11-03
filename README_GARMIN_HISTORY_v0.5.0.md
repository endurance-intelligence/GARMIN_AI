# GARMIN_AI v0.5.0 – Historical Activity Backfill (Phase 1)

Ergänzung zum bestehenden GARMIN_AI-Projekt `eurgupsebxypjqvyizci`.

## Umfang

- Liest die **vollständige Garmin-Aktivitätsliste** paginiert per `start`/`limit`. Es werden bis zu 50 Datensätze pro Lauf angefordert, alle 5 Minuten; die tatsächliche Anzahl der Garmin-Antwort bestimmt die nächste Seitenposition.
- Garmin-Aktivitäts-ID als Primärschlüssel; Upsert statt doppelter Zeilen.
- Ein separater, persistenter Cursor in `public.garmin_history_backfill_state` sorgt für Wiederaufnahme nach Unterbrechungen.
- Supabase-Vault-Token aus dem bestehenden Scheduler wird wiederverwendet. Keine neuen Zugangsdaten.
- Lease schützt vor paralleler Bearbeitung derselben Seite. Fünf aufeinanderfolgende Fehler pausieren den Import.
- Erhalten bleiben vorhandene `rpe_raw`, `feeling_raw` und `summaryDTO`-Details. Die reguläre 3-Stunden-Synchronisierung bleibt unverändert.
- Der Import setzt sich selbst auf `complete`, wenn Garmin erstmals eine **leere** Seite liefert. Cron läuft dann ohne HTTP-Anfrage im Leerlauf.
- **Phase 1** importiert LISTEN-Metadaten aller Aktivitäten (Sportart, Zeit, Distanz, Dauer, durchschnittliche HF, Garmin-Rohfelder). GPX, Zeitreihen, Runden und per-Aktivität-RPE werden **nicht** vollständig rückwirkend importiert. Dafür folgt ein separater Detail-Import.

## Nach Installation im SQL Editor prüfen

```sql
SELECT status, next_offset, scanned_count, upserted_count,
       batch_count, consecutive_failures, last_error, completed_at
FROM public.garmin_history_backfill_state;

SELECT count(*) AS total_activities,
       min(start_time_local) AS earliest_local,
       max(start_time_local) AS latest_local
FROM public.garmin_activities;

SELECT jobname, active
FROM cron.job
WHERE jobname = 'garmin-ai-history-every-5min';
```

Hinweis: `upserted_count` zählt verarbeitete Einträge einschließlich Aktualisierungen, **nicht** ausschließlich neue Aktivitäten.

## Falls die Synchronisierung pausiert

Bitte **zuerst** `last_error` prüfen. Nach geklärter Ursache lässt sich der Lauf mit diesem SQL wieder starten:

```sql
UPDATE public.garmin_history_backfill_state
SET status = 'active', consecutive_failures = 0,
    retry_after = null, lease_token = null, lease_until = null,
    last_error = null
WHERE singleton = true AND status = 'paused';
```

Nur in der Supabase-SQL-Konsole des dedizierten GARMIN_AI-Projekts ausführen. Niemals Geheimnisse oder unbearbeitete Garmin-Rohdaten in Support-Nachrichten kopieren.

## Sicherheitsmodell

`garmin_history_backfill_state` hat RLS, ohne Policies für `anon` oder `authenticated`. Die mutierenden RPC-Funktionen sind für `service_role` autorisiert und verwenden `SECURITY DEFINER`. Der Edge-Function-Aufruf erfordert den vorhandenen Vault-Scheduler-Token (via service-role-only RPC verifiziert). Alle Garmin-Anfragen sind lesend. Keine Änderung an EI Classic.

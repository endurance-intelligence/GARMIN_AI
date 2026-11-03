# GARMIN_AI v0.4.0 – Garmin Health Sync

This package introduces a **separate**, read-only Edge Function to synchronize daily Garmin health summaries. It preserves the v0.3.1 activities Edge Function and scheduler.

## What it reads

- HRV (`lastNightAvg`, ms)
- Resting heart rate (bpm)
- Sleep duration (seconds)
- Average stress level
- Body Battery daily maximum

All source paths follow Garmin Personal API endpoint examples. It queries a **16-day rolling calendar window**, once per day (06:25 UTC), and saves to the existing `public.garmin_daily_metrics` table. The first request is automatically queued after migration. This is **not** a complete historical health import.

## Safety

- No Garmin API key is requested or stored on the local PC; the function reuses `GARMIN_API_KEY` stored in Supabase Secrets.
- No API secret, wearable health values, or raw response is written to local files or logged.
- The new function reuses the existing Vault-backed `garmin_ai_cron_token` and its server-only verification RPC.
- `garmin_daily_metrics` already has RLS enabled and anon/authenticated privileges revoked (v0.3.0 migration).
- Only aggregate counts and source coverage are returned by the function.
- Numeric metrics are only saved if supplied by Garmin; missing values never become `0` and cannot wipe an existing measurement.
- This data is not a medical diagnosis or clearance for exercise.

## Deploy

On `feature/garmin-health-v0.4.0`, execute `Install-GarminHealth.ps1`. Verify the linked project is `eurgupsebxypjqvyizci`. The installation appends a section to `supabase/config.toml`, deploys only `sync-garmin-health`, previews the migration, and then applies it with a normal Supabase confirmation.

## Verify in Supabase SQL Editor

```sql
select
  (select count(*) from public.garmin_daily_metrics) as health_days,
  (select count(*) from public.garmin_sync_runs where source = 'garmin-health' and result = 'success') as successful_health_syncs,
  (select max(finished_at) from public.garmin_sync_runs where source = 'garmin-health' and result = 'success') as last_success_utc,
  (select exists(select 1 from cron.job where jobname = 'garmin-ai-health-daily' and active)) as health_scheduler_active;
```

## Limitations / next steps

- API endpoint availability and fields can change. Missing endpoints are tracked as partial source coverage, without wiping older values.
- Once deployed, inspect coverage before using the data in a Coach or Recovery calculation.
- Later: historical health backfill, proper account access control for front-end viewing, individual baseline calculations, and personalized Coach decisions requiring consent before altering a training plan.

-- GARMIN_AI 0.3.0: standalone, private read-only Garmin data ingestion.
-- No references to or changes in Endurance Intelligence Classic tables.
create table if not exists public.garmin_activities (
  activity_id text primary key,
  activity_name text not null,
  start_time_local text,
  sport_type text,
  distance_m double precision,
  duration_s double precision,
  average_heart_rate double precision,
  rpe_raw double precision,
  feeling_raw double precision,
  raw_activity jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists garmin_activities_start_time_idx
  on public.garmin_activities (start_time_local desc);

create table if not exists public.garmin_daily_metrics (
  metric_date date primary key,
  hrv_ms double precision,
  resting_heart_rate double precision,
  sleep_seconds integer,
  stress_avg double precision,
  body_battery_max double precision,
  raw_metrics jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.garmin_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null default 'garmin-personal-api',
  activity_count integer not null default 0,
  result text not null default 'started' check (result in ('started', 'success', 'error')),
  message text
);

-- Never expose any personal Garmin data to anonymous or generic signed-in clients.
-- The server-side Edge Function alone uses the secret admin client.
alter table public.garmin_activities enable row level security;
alter table public.garmin_daily_metrics enable row level security;
alter table public.garmin_sync_runs enable row level security;

revoke all on table public.garmin_activities from anon, authenticated;
revoke all on table public.garmin_daily_metrics from anon, authenticated;
revoke all on table public.garmin_sync_runs from anon, authenticated;
revoke all on sequence public.garmin_sync_runs_id_seq from anon, authenticated;

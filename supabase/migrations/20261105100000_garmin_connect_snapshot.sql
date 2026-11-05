-- GARMIN_AI v0.7.3.2: private Garmin Connect snapshot.
-- A single, transactional, versioned record, NOT a second FIT ingestion system.
create table if not exists public.garmin_connect_snapshot (
  snapshot_key text primary key check (snapshot_key = 'primary'),
  gear jsonb not null default '[]'::jsonb check (jsonb_typeof(gear) = 'array'),
  schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(schedule) = 'array'),
  activity_gear jsonb not null default '[]'::jsonb check (jsonb_typeof(activity_gear) = 'array'),
  activity_gear_scope text not null default 'single-activity' check (activity_gear_scope in ('single-activity','complete')),
  checked_at timestamptz not null,
  synced_at timestamptz not null default now()
);
alter table public.garmin_connect_snapshot enable row level security;
revoke all on table public.garmin_connect_snapshot from public, anon, authenticated;
grant select, insert, update on table public.garmin_connect_snapshot to service_role;

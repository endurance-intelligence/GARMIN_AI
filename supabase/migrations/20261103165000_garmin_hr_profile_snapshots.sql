-- GARMIN_AI v0.6.2: private, change-only snapshots of Garmin RUNNING HR zones.
-- Single-owner data. No public SELECT/INSERT, no mutation of any Garmin activity or training plans.
create table if not exists public.garmin_hr_profile_snapshots (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  observed_at timestamptz not null default now(),
  source text not null default 'garmin-personal-api',
  profile jsonb not null,
  constraint garmin_hr_profile_snapshot_is_object check (jsonb_typeof(profile) = 'object')
);
create index if not exists garmin_hr_profile_snapshots_observed_idx
  on public.garmin_hr_profile_snapshots(observed_at desc);

create table if not exists public.garmin_hr_profile_sync_status (
  id boolean primary key default true check (id = true),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text
);
insert into public.garmin_hr_profile_sync_status(id) values(true) on conflict(id) do nothing;

alter table public.garmin_hr_profile_snapshots enable row level security;
alter table public.garmin_hr_profile_sync_status enable row level security;
revoke all on public.garmin_hr_profile_snapshots from anon, authenticated;
revoke all on public.garmin_hr_profile_sync_status from anon, authenticated;
revoke all on sequence public.garmin_hr_profile_snapshots_id_seq from anon, authenticated;

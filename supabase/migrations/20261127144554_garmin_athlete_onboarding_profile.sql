create table public.garmin_athlete_profile (
 user_id uuid primary key references auth.users(id) on delete cascade,
 profile jsonb not null check (jsonb_typeof(profile)='object' and octet_length(profile::text)<=4000),
 updated_at timestamptz not null default now()
);
alter table public.garmin_athlete_profile enable row level security;
revoke all on public.garmin_athlete_profile from public, anon, authenticated;
grant select, insert, update, delete on public.garmin_athlete_profile to service_role;

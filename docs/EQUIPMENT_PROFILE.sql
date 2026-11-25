create table if not exists public.garmin_equipment_profile (
 user_id uuid primary key references auth.users(id) on delete cascade,
 available text[] not null default '{}'::text[],
 treadmill_max_incline_pct numeric(4,1),
 updated_at timestamptz not null default now(),
 constraint equipment_allowed check (available <@ array['bodyweight','rowing','treadmill','bike','trainer']::text[] and cardinality(available)<=5 and array_position(available,null) is null),
 constraint equipment_incline check (treadmill_max_incline_pct is null or ('treadmill'=any(available) and treadmill_max_incline_pct between 0 and 40))
);
alter table public.garmin_equipment_profile enable row level security;
revoke all on table public.garmin_equipment_profile from public,anon,authenticated;
grant select,insert,update on table public.garmin_equipment_profile to service_role;

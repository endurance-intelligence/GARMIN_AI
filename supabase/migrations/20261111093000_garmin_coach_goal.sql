-- GARMIN_AI v0.9.31: single-athlete main race goal, separately confirmed by user.
create table if not exists public.garmin_coach_goals (
 user_id uuid primary key references auth.users(id) on delete cascade,
 race_name text not null check (char_length(race_name) between 3 and 100),
 race_date date not null,
 distance_km numeric(6,1) not null check (distance_km>0 and distance_km<=500),
 target_hours numeric(5,2) check (target_hours is null or (target_hours>0 and target_hours<=100)),
 race_location text not null default '' check (char_length(race_location)<=120),
 race_start_time time,
 coach_note text not null default '' check (char_length(coach_note)<=600),
 updated_at timestamptz not null default now()
);
alter table public.garmin_coach_goals enable row level security;
revoke all on public.garmin_coach_goals from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.garmin_coach_goals to service_role;
comment on table public.garmin_coach_goals is
 'One athlete-selected race goal. Phase is derived in UI; no automated workout publishing.';

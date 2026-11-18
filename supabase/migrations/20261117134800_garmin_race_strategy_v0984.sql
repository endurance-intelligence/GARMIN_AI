-- v0.9.84: athlete-owned event-day fueling, pacing and stop strategy.
create table if not exists public.garmin_race_strategy (
 user_id uuid not null references auth.users(id) on delete cascade,
 race_date date not null,
 race_name text not null check (char_length(race_name) between 1 and 100),
 course_mode text not null default 'laps'
   check (course_mode in ('laps','point_to_point','other')),
 loop_km numeric(6,2) check (loop_km > 0 and loop_km <= 100),
 moving_minutes_per_loop integer check (moving_minutes_per_loop between 10 and 360),
 pause_minutes_per_loop integer check (pause_minutes_per_loop between 0 and 120),
 long_stop_every integer check (long_stop_every between 2 and 50),
 long_stop_minutes integer check (long_stop_minutes between 0 and 120),
 target_pace_seconds integer check (target_pace_seconds between 180 and 1200),
 carbs_g_per_hour integer check (carbs_g_per_hour between 0 and 150),
 fluid_ml_per_hour integer check (fluid_ml_per_hour between 0 and 1500),
 sodium_mg_per_hour integer check (sodium_mg_per_hour between 0 and 3000),
 fuel_notes text not null default '' check (char_length(fuel_notes) <= 500),
 stops_notes text not null default '' check (char_length(stops_notes) <= 500),
 gear_notes text not null default '' check (char_length(gear_notes) <= 500),
 updated_at timestamptz not null default now(),
 primary key(user_id,race_date,race_name)
);
alter table public.garmin_race_strategy enable row level security;
create policy "athlete race plan select" on public.garmin_race_strategy
 for select to authenticated using (user_id=(select auth.uid()));
create policy "athlete race plan insert" on public.garmin_race_strategy
 for insert to authenticated with check (user_id=(select auth.uid()));
create policy "athlete race plan update" on public.garmin_race_strategy
 for update to authenticated using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));
revoke all on public.garmin_race_strategy from anon;
grant select,insert,update on public.garmin_race_strategy to authenticated;
comment on table public.garmin_race_strategy is
 'Private, athlete-confirmed race-day strategy drafts. No workouts or publishing actions.';

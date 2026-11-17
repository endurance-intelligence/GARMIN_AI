-- P2: remember the athlete-confirmed race goal with its saved event strategy.
-- Keeps a completed race comparable after a new active goal is selected.
alter table public.garmin_race_strategy
 add column if not exists race_distance_km numeric(6,2)
 check (race_distance_km > 0 and race_distance_km <= 500);
alter table public.garmin_race_strategy
 add column if not exists goal_target_hours numeric(6,2)
 check (goal_target_hours > 0 and goal_target_hours <= 100);
-- Backfill only a genuine date/name match with the current owner goal.
update public.garmin_race_strategy as strategy
set race_distance_km=coalesce(strategy.race_distance_km,goal.distance_km),
    goal_target_hours=coalesce(strategy.goal_target_hours,goal.target_hours)
from public.garmin_coach_goals as goal
where strategy.user_id=goal.user_id
 and strategy.race_date=goal.race_date
 and strategy.race_name=goal.race_name
 and (strategy.race_distance_km is null or strategy.goal_target_hours is null);
-- Existing SELECT/INSERT/UPDATE owner-RLS policies remain unchanged.
comment on column public.garmin_race_strategy.race_distance_km is
 'Snapshot of explicitly chosen race distance, not an inferred result';
comment on column public.garmin_race_strategy.goal_target_hours is
 'Snapshot of explicitly chosen race target time, not an official finish time';

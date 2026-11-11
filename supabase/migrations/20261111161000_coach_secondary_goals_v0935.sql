
-- Independent B / C / tune-up race goals. Existing garmin_coach_goals stays the coach's ONE primary goal.
create table if not exists public.garmin_coach_secondary_goals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 race_name text not null check(char_length(race_name) between 3 and 100),
 race_date date not null,
 distance_km numeric(6,1) not null check(distance_km>0 and distance_km<=500),
 target_hours numeric(5,2) check(target_hours is null or (target_hours>0 and target_hours<=100)),
 race_location text not null default '' check(char_length(race_location)<=120),
 race_start_time time,
 coach_note text not null default '' check(char_length(coach_note)<=600),
 updated_at timestamptz not null default now(),
 unique(user_id,race_name,race_date)
);
create index if not exists idx_garmin_coach_secondary_goals_user_date
 on public.garmin_coach_secondary_goals(user_id,race_date);
alter table public.garmin_coach_secondary_goals enable row level security;
revoke all on public.garmin_coach_secondary_goals from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.garmin_coach_secondary_goals to service_role;

-- Promote a selected B/C goal to main atomically, preserving the previous main as a secondary.
create or replace function public.garmin_promote_race_goal(p_user_id uuid,p_secondary_id uuid)
 returns boolean language plpgsql security invoker set search_path=public as $$
declare old_goal public.garmin_coach_goals%rowtype;
        chosen public.garmin_coach_secondary_goals%rowtype;
begin
 select * into old_goal from public.garmin_coach_goals where user_id=p_user_id for update;
 select * into chosen from public.garmin_coach_secondary_goals
  where user_id=p_user_id and id=p_secondary_id for update;
 if chosen.id is null then return false; end if;
 if old_goal.user_id is not null then
  insert into public.garmin_coach_secondary_goals
   (user_id,race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at)
  values (p_user_id,old_goal.race_name,old_goal.race_date,old_goal.distance_km,
   old_goal.target_hours,old_goal.race_location,old_goal.race_start_time,
   old_goal.coach_note,now())
  on conflict(user_id,race_name,race_date) do update
   set distance_km=excluded.distance_km,target_hours=excluded.target_hours,
       race_location=excluded.race_location,race_start_time=excluded.race_start_time,
       coach_note=excluded.coach_note,updated_at=now();
 end if;
 insert into public.garmin_coach_goals
  (user_id,race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at)
 values(p_user_id,chosen.race_name,chosen.race_date,chosen.distance_km,chosen.target_hours,
  chosen.race_location,chosen.race_start_time,chosen.coach_note,now())
 on conflict(user_id) do update
  set race_name=excluded.race_name,race_date=excluded.race_date,
   distance_km=excluded.distance_km,target_hours=excluded.target_hours,
   race_location=excluded.race_location,race_start_time=excluded.race_start_time,
   coach_note=excluded.coach_note,updated_at=now();
 delete from public.garmin_coach_secondary_goals where user_id=p_user_id and id=p_secondary_id;
 return true;
end $$;
revoke all on function public.garmin_promote_race_goal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.garmin_promote_race_goal(uuid,uuid) to service_role;

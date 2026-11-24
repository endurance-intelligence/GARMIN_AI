-- Bounded private image data. NULL = use archived event logo; empty = explicitly removed.
alter table public.garmin_coach_goals add column if not exists goal_logo text check (goal_logo is null or goal_logo='' or (length(goal_logo)<=350000 and left(goal_logo,22)='data:image/webp;base64,'));
alter table public.garmin_coach_secondary_goals add column if not exists goal_logo text check (goal_logo is null or goal_logo='' or (length(goal_logo)<=350000 and left(goal_logo,22)='data:image/webp;base64,'));
create or replace function public.garmin_promote_race_goal(p_user_id uuid,p_secondary_id uuid)
 returns boolean language plpgsql security invoker set search_path=public as $$
declare old_goal public.garmin_coach_goals%rowtype;
        chosen public.garmin_coach_secondary_goals%rowtype;
begin
 select * into old_goal from public.garmin_coach_goals where user_id=p_user_id for update;
 select * into chosen from public.garmin_coach_secondary_goals
  where user_id=p_user_id and id=p_secondary_id for update;
 if chosen.id is null or chosen.race_date < (now() at time zone 'Europe/Berlin')::date then return false; end if;
 if old_goal.user_id is not null then
  insert into public.garmin_coach_secondary_goals
   (user_id,race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,goal_logo,updated_at)
  values (p_user_id,old_goal.race_name,old_goal.race_date,old_goal.distance_km,
   old_goal.target_hours,old_goal.race_location,old_goal.race_start_time,
   old_goal.coach_note,old_goal.goal_logo,now())
  on conflict(user_id,race_name,race_date) do update
   set distance_km=excluded.distance_km,target_hours=excluded.target_hours,
       race_location=excluded.race_location,race_start_time=excluded.race_start_time,
       coach_note=excluded.coach_note,goal_logo=excluded.goal_logo,updated_at=now();
 end if;
 insert into public.garmin_coach_goals
  (user_id,race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,goal_logo,updated_at)
 values(p_user_id,chosen.race_name,chosen.race_date,chosen.distance_km,chosen.target_hours,
  chosen.race_location,chosen.race_start_time,chosen.coach_note,chosen.goal_logo,now())
 on conflict(user_id) do update
  set race_name=excluded.race_name,race_date=excluded.race_date,
   distance_km=excluded.distance_km,target_hours=excluded.target_hours,
   race_location=excluded.race_location,race_start_time=excluded.race_start_time,
   coach_note=excluded.coach_note,goal_logo=excluded.goal_logo,updated_at=now();
 delete from public.garmin_coach_secondary_goals where user_id=p_user_id and id=p_secondary_id;
 return true;
end $$;
revoke all on function public.garmin_promote_race_goal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.garmin_promote_race_goal(uuid,uuid) to service_role;

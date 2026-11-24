alter table public.garmin_coach_goals add column if not exists maintenance_weekly_km numeric(4,1) check (maintenance_weekly_km between 1 and 200);
create or replace function public.garmin_reset_maintenance_on_goal_change()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.race_date is distinct from old.race_date or new.race_name is distinct from old.race_name then
  new.maintenance_weekly_km := null;
 end if;
 return new;
end;
$$;
revoke all on function public.garmin_reset_maintenance_on_goal_change() from public,anon,authenticated;
drop trigger if exists garmin_reset_maintenance_on_goal_change on public.garmin_coach_goals;
create trigger garmin_reset_maintenance_on_goal_change before update on public.garmin_coach_goals
for each row execute function public.garmin_reset_maintenance_on_goal_change();

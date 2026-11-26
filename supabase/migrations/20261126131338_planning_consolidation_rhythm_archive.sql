create table public.garmin_training_rhythm (
 user_id uuid primary key references auth.users(id) on delete cascade,
 rhythm jsonb not null check (jsonb_typeof(rhythm)='object' and octet_length(rhythm::text)<2000),
 updated_at timestamptz not null default now()
);
alter table public.garmin_training_rhythm enable row level security;
revoke all on public.garmin_training_rhythm from public,anon,authenticated,service_role;
grant select,insert,update on public.garmin_training_rhythm to service_role;

create function public.garmin_archive_week_revision(p_user uuid,p_request uuid,p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 w date := (p_snapshot->>'weekStart')::date;
 d date := (now() at time zone 'Europe/Berlin')::date;
 prior public.garmin_weekly_plan_history%rowtype;
 result public.garmin_weekly_plan_history%rowtype;
 merged jsonb;
begin
 if w < d - (extract(isodow from d)::int-1) or w>d+42 or extract(isodow from w)<>1 then raise exception 'Invalid archive week'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text||':'||w::text,0));
 select * into result from public.garmin_weekly_plan_history where user_id=p_user and request_id=p_request;
 if found then
  if result.week_start<>w then raise exception 'Request conflict'; end if;
  return jsonb_build_object('id',result.id,'week_start',result.week_start,'created_at',result.created_at,'snapshot',result.snapshot);
 end if;
 select * into prior from public.garmin_weekly_plan_history where user_id=p_user and week_start=w order by created_at desc,id desc limit 1;
 if found then
  -- Preserve the last documented intention for days that have elapsed.
  -- Today's completed entries stay in the plan if the live Coach no longer proposes them.
  select coalesce(jsonb_agg(e order by e->>'date',e->>'kind',e->>'title',e->>'source',e::text),'[]'::jsonb) into merged from (
   select e from jsonb_array_elements(prior.snapshot->'entries') e where (e->>'date')::date<d
   union all
   select e from jsonb_array_elements(p_snapshot->'entries') e where (e->>'date')::date>=d
   union all
   select e from jsonb_array_elements(prior.snapshot->'entries') e where (e->>'date')::date=d
    and not exists(select 1 from jsonb_array_elements(p_snapshot->'entries') n where n->>'date'=e->>'date' and n->>'kind'=e->>'kind')
    and (exists(select 1 from public.garmin_activities a where left(a.start_time_local::text,10)=d::text)
      or exists(select 1 from public.garmin_cross_training_sessions m where m.user_id=p_user and m.session_date=d))
  ) s;
  p_snapshot := jsonb_set(jsonb_set(p_snapshot,'{entries}',merged),'{partial}',coalesce(prior.snapshot->'partial','true'::jsonb));
  if prior.snapshot=p_snapshot then result:=prior;
   return jsonb_build_object('id',result.id,'week_start',result.week_start,'created_at',result.created_at,'snapshot',result.snapshot);
  end if;
 else
  select coalesce(jsonb_agg(e order by e->>'date',e->>'kind',e->>'title',e->>'source',e::text),'[]'::jsonb) into merged from jsonb_array_elements(p_snapshot->'entries') e;
  p_snapshot := jsonb_set(jsonb_set(p_snapshot,'{entries}',merged),'{partial}',to_jsonb(w<d));
 end if;
 insert into public.garmin_weekly_plan_history(user_id,week_start,request_id,snapshot)
 values(p_user,w,p_request,p_snapshot) returning * into result;
 return jsonb_build_object('id',result.id,'week_start',result.week_start,'created_at',result.created_at,'snapshot',result.snapshot);
end $$;
revoke all on function public.garmin_archive_week_revision(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.garmin_archive_week_revision(uuid,uuid,jsonb) to service_role;

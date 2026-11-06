-- GARMIN_AI v0.7.6.2 - Private Cloud Connect LIVE verification state.
-- This records only a small status and timestamps; never profile data or tokens.
-- Existing Garmin activities/gear/health/FIT tables remain untouched.
create table if not exists garmin_private.cloud_connect_check (
  singleton smallint primary key default 1 check (singleton = 1),
  last_checked_at timestamptz not null,
  last_success_at timestamptz,
  last_result text not null check (last_result in
    ('verified','expired','auth_failed','rate_limited','unavailable','invalid_response'))
);
revoke all on garmin_private.cloud_connect_check from public,anon,authenticated;
comment on table garmin_private.cloud_connect_check is
  'Owner-only cloud-to-Garmin session verification result, no private profile content.';

create or replace function public.garmin_connect_cloud_check_record(p_result text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_checked timestamptz := pg_catalog.now();
begin
  if p_result not in ('verified','expired','auth_failed','rate_limited',
     'unavailable','invalid_response') or p_result is null then
    raise exception 'Invalid Garmin check status';
  end if;
  insert into garmin_private.cloud_connect_check(
    singleton,last_checked_at,last_success_at,last_result)
  values (1,v_checked,
    case when p_result='verified' then v_checked else null end,p_result)
  on conflict (singleton) do update set
    last_checked_at=excluded.last_checked_at,
    last_success_at=case when excluded.last_result='verified'
       then excluded.last_checked_at
       else garmin_private.cloud_connect_check.last_success_at end,
    last_result=excluded.last_result;
  return pg_catalog.jsonb_build_object('saved',true);
end
$$;
revoke all on function public.garmin_connect_cloud_check_record(text)
  from public,anon,authenticated;
grant execute on function public.garmin_connect_cloud_check_record(text) to service_role;

create or replace function public.garmin_connect_cloud_check_state()
returns jsonb
language sql security definer set search_path=''
as $$
  select coalesce((
    select pg_catalog.jsonb_build_object(
      'lastCheckedAt', last_checked_at,
      'lastSuccessAt', last_success_at,
      'lastResult', last_result)
    from garmin_private.cloud_connect_check where singleton=1),
    pg_catalog.jsonb_build_object(
      'lastCheckedAt',null,'lastSuccessAt',null,'lastResult','never'))
$$;
revoke all on function public.garmin_connect_cloud_check_state()
  from public,anon,authenticated;
grant execute on function public.garmin_connect_cloud_check_state() to service_role;

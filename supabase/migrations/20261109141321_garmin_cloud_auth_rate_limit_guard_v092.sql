-- GARMIN_AI v0.9.2: private, fail-closed 24h OAuth cooldown after Garmin HTTP 429.
-- Recorded solely by signed GitHub OIDC cloud jobs via service-role Edge RPC.
-- Existing OAuth credentials, exercise data, calendar and weight remain unchanged.
create table if not exists garmin_private.cloud_auth_rate_limit (
  singleton smallint primary key check (singleton=1),
  blocked_until timestamptz not null,
  last_limited_at timestamptz not null default clock_timestamp()
);
alter table garmin_private.cloud_auth_rate_limit enable row level security;
revoke all on garmin_private.cloud_auth_rate_limit from public,anon,authenticated;
grant select,insert,update on garmin_private.cloud_auth_rate_limit to service_role;

create or replace function public.garmin_cloud_auth_guard_state()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_blocked_until timestamptz;
begin
 select blocked_until into v_blocked_until
 from garmin_private.cloud_auth_rate_limit where singleton=1;
 return pg_catalog.jsonb_build_object(
   'allowed',v_blocked_until is null or v_blocked_until<=clock_timestamp(),
   'retryAfter',case when v_blocked_until>clock_timestamp()
                    then v_blocked_until else null end
 );
end;
$$;

create or replace function public.garmin_cloud_auth_guard_rate_limit()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_until timestamptz;
begin
 insert into garmin_private.cloud_auth_rate_limit(singleton,blocked_until,last_limited_at)
 values(1,clock_timestamp()+interval '24 hours',clock_timestamp())
 on conflict(singleton) do update
 set blocked_until=pg_catalog.greatest(
       garmin_private.cloud_auth_rate_limit.blocked_until,
       excluded.blocked_until
     ),
     last_limited_at=clock_timestamp()
 returning blocked_until into v_until;
 return pg_catalog.jsonb_build_object('recorded',true,'retryAfter',v_until);
end;
$$;

revoke all on function public.garmin_cloud_auth_guard_state() from public,anon,authenticated;
revoke all on function public.garmin_cloud_auth_guard_rate_limit() from public,anon,authenticated;
grant execute on function public.garmin_cloud_auth_guard_state() to service_role;
grant execute on function public.garmin_cloud_auth_guard_rate_limit() to service_role;
comment on table garmin_private.cloud_auth_rate_limit is
'Private Garmin Connect OAuth retry guard; no tokens, user profile or mass stored.';

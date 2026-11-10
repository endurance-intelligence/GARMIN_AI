-- Garmin Cloud OAuth 429 cooldown hotfix (applied in Supabase 2026-11-10).
-- PostgreSQL's GREATEST is a special SQL expression, not pg_catalog.greatest().
-- Previous guard raised 42883 and failed to persist the essential 24-hour lock.
-- Keep the exact workflow OIDC authorization, RLS and service-role-only grants.
create or replace function public.garmin_cloud_auth_guard_rate_limit()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_until timestamptz;
begin
 insert into garmin_private.cloud_auth_rate_limit(singleton,blocked_until,last_limited_at)
 values (1,pg_catalog.clock_timestamp()+interval '24 hours',pg_catalog.clock_timestamp())
 on conflict(singleton) do update
 set blocked_until=greatest(
       garmin_private.cloud_auth_rate_limit.blocked_until,
       excluded.blocked_until
     ),
     last_limited_at=pg_catalog.clock_timestamp()
 returning blocked_until into v_until;
 return pg_catalog.jsonb_build_object('recorded',true,'retryAfter',v_until);
end;
$function$;
revoke all on function public.garmin_cloud_auth_guard_rate_limit() from public,anon,authenticated;
grant execute on function public.garmin_cloud_auth_guard_rate_limit() to service_role;

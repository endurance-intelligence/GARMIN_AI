-- GARMIN_AI v0.7.5 — scheduler observability only.
-- The existing cron schedules and Garmin workers are intentionally not changed.
-- NEVER expose cron.job.command (which may contain secret-related SQL).
-- Service role only: the owner-authenticated Edge function returns safe summaries.
create or replace function public.garmin_sync_scheduler_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  outcome jsonb := '[]'::jsonb;
begin
  if pg_catalog.to_regclass('cron.job') is null or
     pg_catalog.to_regclass('cron.job_run_details') is null then
    return pg_catalog.jsonb_build_object('available',false,'jobs',outcome);
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',j.jobname,
      'active',j.active,
      'lastStartedAt',r.start_time,
      'lastFinishedAt',r.end_time,
      'lastDispatchStatus',r.status
    ) order by j.jobname),'[]'::jsonb)
  into outcome
  from cron.job j
  left join lateral (
    select d.start_time,d.end_time,d.status
      from cron.job_run_details d
     where d.jobid=j.jobid
     order by d.runid desc limit 1
  ) r on true
  where j.jobname ilike '%garmin%';
  return pg_catalog.jsonb_build_object('available',true,'jobs',outcome);
exception
  when insufficient_privilege or undefined_table then
    return pg_catalog.jsonb_build_object('available',false,'jobs','[]'::jsonb);
end
$fn$;
revoke all on function public.garmin_sync_scheduler_status() from public,anon,authenticated;
grant execute on function public.garmin_sync_scheduler_status() to service_role;
comment on function public.garmin_sync_scheduler_status() is
'Private cron dispatch metadata only. Dispatch success does NOT prove Garmin API sync success.';

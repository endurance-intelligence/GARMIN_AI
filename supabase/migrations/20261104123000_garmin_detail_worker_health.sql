-- GARMIN_AI v0.6.5: read-only operational health for the existing Garmin details worker.
-- No schedule, queue, token, secret, or existing import function is changed.
-- Only service_role may execute this function, after owner verification in the Edge Function.
-- pg_cron reports DISPATCH status; an accepted dispatch does not prove Garmin API success.

create or replace function public.garmin_detail_worker_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_jobid bigint;
  v_active boolean;
  v_schedule text;
  v_run_at timestamptz;
  v_run_status text;
  v_hour bigint;
  v_day bigint;
  v_last_stored timestamptz;
  v_queued bigint;
  v_retry bigint;
  v_processing bigint;
  v_paused bigint;
  v_unavailable bigint;
  v_unenqueued bigint;
begin
  select j.jobid, j.active, j.schedule
    into v_jobid, v_active, v_schedule
  from cron.job j
  where j.jobname = 'garmin-ai-details-every-5min'
  order by j.jobid desc
  limit 1;

  if v_jobid is not null then
    select r.start_time, r.status
      into v_run_at, v_run_status
    from cron.job_run_details r
    where r.jobid = v_jobid
    order by r.start_time desc
    limit 1;
  end if;

  select
    count(*) filter (where status in ('complete','partial')
      and fetched_at >= now() - interval '60 minutes'),
    count(*) filter (where status in ('complete','partial')
      and fetched_at >= now() - interval '24 hours'),
    max(fetched_at) filter (where status in ('complete','partial')),
    count(*) filter (where status = 'queued'),
    count(*) filter (where status = 'retry'),
    count(*) filter (where status = 'processing'),
    count(*) filter (where status = 'paused'),
    count(*) filter (where status = 'unavailable')
  into v_hour, v_day, v_last_stored, v_queued, v_retry,
       v_processing, v_paused, v_unavailable
  from public.garmin_activity_details;

  select count(*) into v_unenqueued
  from public.garmin_activities a
  where not exists (
    select 1 from public.garmin_activity_details d
    where d.activity_id = a.activity_id
  );

  return jsonb_build_object(
    'scheduler',jsonb_build_object(
      'configured', v_jobid is not null,
      'active', v_active,
      'schedule', v_schedule,
      'lastDispatchAt', v_run_at,
      'lastDispatchStatus', v_run_status
    ),
    'progress',jsonb_build_object(
      'storedLastHour',v_hour,
      'storedLast24h',v_day,
      'lastStoredAt',v_last_stored,
      'queued',v_queued,
      'retry',v_retry,
      'processing',v_processing,
      'paused',v_paused,
      'unavailable',v_unavailable,
      'notEnqueued',v_unenqueued
    )
  );
end
$body$;

revoke all on function public.garmin_detail_worker_health()
  from public, anon, authenticated;
grant execute on function public.garmin_detail_worker_health() to service_role;

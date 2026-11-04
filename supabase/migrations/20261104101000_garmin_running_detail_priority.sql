-- GARMIN_AI v0.6.4: prioritise run activity details within existing bounded queue.
-- No new cron, no change to current 2-activities/invocation, no bulk requeues.
-- All non-running activities remain eligible and will eventually be processed.
-- Existing complete/partial/unavailable rows remain untouched.
-- Replaces only the existing claim function; preserves SECURITY DEFINER and grants.

create or replace function public.garmin_detail_claim()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_activity_id text;
  v_sport text;
  v_lease uuid;
begin
  -- Enqueue the newest as-yet-unprocessed activities. The unique primary key
  -- and ON CONFLICT prevent duplicates. Older history appears automatically.
  insert into public.garmin_activity_details (activity_id)
  select a.activity_id from public.garmin_activities a
  where not exists (
    select 1 from public.garmin_activity_details d
    where d.activity_id = a.activity_id
  )
  order by case when a.sport_type in ('running','track_running','treadmill_running','ultra_run') then 0 else 1 end, a.start_time_local desc nulls last, a.activity_id desc
  limit 8
  on conflict (activity_id) do nothing;

  select d.activity_id, a.sport_type
    into v_activity_id, v_sport
  from public.garmin_activity_details d
  join public.garmin_activities a on a.activity_id = d.activity_id
  where (
       (d.status in ('queued','retry')
         and (d.retry_after is null or d.retry_after <= now()))
       or (d.status = 'processing' and d.lease_until < now())
  )
  order by case when a.sport_type in ('running','track_running','treadmill_running','ultra_run') then 0 else 1 end, a.start_time_local desc nulls last, a.activity_id desc
  for update of d skip locked
  limit 1;

  if not found then return null; end if;

  update public.garmin_activity_details
  set status = 'processing',
      attempts = attempts + 1,
      lease_token = gen_random_uuid(),
      lease_until = now() + interval '3 minutes',
      updated_at = now()
  where activity_id = v_activity_id
  returning lease_token into v_lease;

  return jsonb_build_object(
    'activity_id', v_activity_id,
    'sport_type', v_sport,
    'lease_token', v_lease
  );
end
$body$;
revoke all on function public.garmin_detail_claim() from public, anon, authenticated;
grant execute on function public.garmin_detail_claim() to service_role;

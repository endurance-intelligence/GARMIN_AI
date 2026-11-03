-- GARMIN_AI v0.5.2: private activity details + resumable, bounded enrichment.
-- Requires v0.5.0 garmin_activities and v0.3.1 Garmin Vault scheduler token.
-- No changes to EI Classic, existing activity/history/health jobs or credentials.

create table if not exists public.garmin_activity_details (
  activity_id text primary key references public.garmin_activities(activity_id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','processing','retry','complete','partial','unavailable','paused')),
  summary jsonb not null default '{}'::jsonb,
  laps jsonb not null default '[]'::jsonb,
  samples jsonb not null default '[]'::jsonb,
  metric_descriptors jsonb not null default '[]'::jsonb,
  hr_zones jsonb not null default '[]'::jsonb,
  workouts jsonb not null default '[]'::jsonb,
  chart_available boolean not null default false,
  laps_available boolean not null default false,
  zones_available boolean not null default false,
  sample_count integer not null default 0,
  hr_sample_count integer not null default 0,
  lap_count integer not null default 0,
  attempts integer not null default 0,
  last_error text,
  retry_after timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  fetched_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists garmin_activity_details_work_idx
  on public.garmin_activity_details (status, retry_after, lease_until);

alter table public.garmin_activity_details enable row level security;
revoke all on table public.garmin_activity_details from public, anon, authenticated;

-- Claim at most one activity for a worker invocation. This is safe if Cron overlaps
-- and does not depend on the list-history cursor finishing first.
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
  order by a.start_time_local desc nulls last, a.activity_id desc
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
  order by a.start_time_local desc nulls last, a.activity_id desc
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

-- Store only normalized training measurements: never Garmin GPS/polyline data.
create or replace function public.garmin_detail_store(
  p_activity_id text,
  p_lease_token uuid,
  p_status text,
  p_summary jsonb,
  p_laps jsonb,
  p_samples jsonb,
  p_descriptors jsonb,
  p_zones jsonb,
  p_workouts jsonb,
  p_chart_available boolean,
  p_laps_available boolean,
  p_zones_available boolean,
  p_hr_count integer,
  p_rpe double precision,
  p_feeling double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_current public.garmin_activity_details%rowtype;
  v_samples integer;
  v_laps integer;
begin
  if p_status not in ('complete','partial')
     or p_summary is null or jsonb_typeof(p_summary) <> 'object'
     or p_laps is null or jsonb_typeof(p_laps) <> 'array'
     or p_samples is null or jsonb_typeof(p_samples) <> 'array'
     or p_descriptors is null or jsonb_typeof(p_descriptors) <> 'array'
     or p_zones is null or jsonb_typeof(p_zones) <> 'array'
     or p_workouts is null or jsonb_typeof(p_workouts) <> 'array' then
    raise exception 'Invalid detail payload';
  end if;

  v_samples := jsonb_array_length(p_samples);
  v_laps := jsonb_array_length(p_laps);
  if v_samples > 1800 or v_laps > 1000 or jsonb_array_length(p_workouts) > 10
     or p_hr_count < 0 or p_hr_count > v_samples then
    raise exception 'Oversized detail payload';
  end if;

  select * into v_current
  from public.garmin_activity_details
  where activity_id = p_activity_id for update;
  if not found or v_current.status <> 'processing'
     or v_current.lease_token is distinct from p_lease_token
     or v_current.lease_until < now() then
    raise exception 'Stale Garmin detail claim';
  end if;

  update public.garmin_activity_details
  set status = p_status,
      summary = p_summary,
      laps = p_laps,
      samples = p_samples,
      metric_descriptors = p_descriptors,
      hr_zones = p_zones,
      workouts = p_workouts,
      chart_available = p_chart_available,
      laps_available = p_laps_available,
      zones_available = p_zones_available,
      sample_count = v_samples,
      hr_sample_count = p_hr_count,
      lap_count = v_laps,
      last_error = null,
      retry_after = null,
      lease_token = null,
      lease_until = null,
      fetched_at = now(),
      updated_at = now()
  where activity_id = p_activity_id;

  -- RPE/Feeling are stored in Garmin RAW scale; never interpret them as 0..10.
  update public.garmin_activities
  set rpe_raw = coalesce(p_rpe, rpe_raw),
      feeling_raw = coalesce(p_feeling, feeling_raw)
  where activity_id = p_activity_id;

  return jsonb_build_object('stored', true, 'status', p_status,
                            'samples', v_samples, 'laps', v_laps);
end
$body$;
revoke all on function public.garmin_detail_store(
  text,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,boolean,boolean,integer,double precision,double precision
) from public, anon, authenticated;
grant execute on function public.garmin_detail_store(
  text,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,boolean,boolean,integer,double precision,double precision
) to service_role;

create or replace function public.garmin_detail_fail(
  p_activity_id text, p_lease_token uuid, p_reason text, p_permanent boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $body$
begin
  update public.garmin_activity_details
  set status = case when p_permanent then 'unavailable'
                    when attempts >= 5 then 'paused' else 'retry' end,
      retry_after = case when p_permanent or attempts >= 5 then null
                         else now() + (interval '5 minutes' * power(2.0, least(attempts, 4))) end,
      last_error = left(coalesce(p_reason,'unknown'),100),
      lease_token = null,
      lease_until = null,
      updated_at = now()
  where activity_id = p_activity_id
    and status = 'processing' and lease_token = p_lease_token;
end
$body$;
revoke all on function public.garmin_detail_fail(text,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.garmin_detail_fail(text,uuid,text,boolean) to service_role;

-- Avoid waking the Edge Function when there is nothing eligible to enrich.
create or replace function garmin_private.dispatch_garmin_details()
returns bigint
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_token text;
  v_request_id bigint;
begin
  if not exists (
    select 1 from public.garmin_activities a
    where not exists (select 1 from public.garmin_activity_details d
                      where d.activity_id = a.activity_id)
  ) and not exists (
    select 1 from public.garmin_activity_details d
    where (d.status in ('queued','retry') and
          (d.retry_after is null or d.retry_after <= now()))
       or (d.status = 'processing' and d.lease_until < now())
  ) then return null; end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'garmin_ai_cron_token';
  if v_token is null or length(v_token) <> 64 then
    raise exception 'GARMIN_AI scheduler token unavailable';
  end if;

  select net.http_post(
    url := 'https://eurgupsebxypjqvyizci.supabase.co/functions/v1/backfill-garmin-details',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-garmin-sync-secret', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) into v_request_id;
  return v_request_id;
end
$body$;
revoke all on function garmin_private.dispatch_garmin_details() from public, anon, authenticated;

-- Offset by 2 minutes from the 5-minute history-list cron (minute 0,5,10...).
select cron.schedule(
  'garmin-ai-details-every-5min',
  '2-59/5 * * * *',
  'select garmin_private.dispatch_garmin_details();'
);

-- Queue one initial request after migration commit.
select garmin_private.dispatch_garmin_details();

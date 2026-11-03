-- GARMIN_AI v0.5.0 - private, resumable historic Garmin activity import.
-- Applies ONLY to the dedicated GARMIN_AI Supabase project.
-- Requires v0.3.1 Vault token, pg_net/pg_cron, and v0.3.0 garmin_activities.

create table if not exists public.garmin_history_backfill_state (
  singleton boolean primary key default true check (singleton),
  status text not null default 'active' check (status in ('active', 'paused', 'complete')),
  next_offset integer not null default 0 check (next_offset >= 0),
  scanned_count integer not null default 0,
  upserted_count integer not null default 0,
  batch_count integer not null default 0,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  retry_after timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.garmin_history_backfill_state(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.garmin_history_backfill_state enable row level security;
revoke all on table public.garmin_history_backfill_state from public, anon, authenticated;

-- Atomically claim exactly one page, avoiding concurrent imports from cron and retries.
create or replace function public.garmin_history_claim()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_offset integer;
  v_lease uuid;
begin
  update public.garmin_history_backfill_state
  set lease_token = gen_random_uuid(),
      lease_until = now() + interval '2 minutes',
      updated_at = now()
  where singleton = true
    and status = 'active'
    and (retry_after is null or retry_after <= now())
    and (lease_until is null or lease_until < now())
  returning next_offset, lease_token into v_offset, v_lease;

  if not found then return null; end if;
  return jsonb_build_object('offset', v_offset, 'lease_token', v_lease);
end
$body$;
revoke all on function public.garmin_history_claim() from public, anon, authenticated;
grant execute on function public.garmin_history_claim() to service_role;

-- Persist page and cursor together. Preserve detailed RPE / Feeling from v0.3.x.
create or replace function public.garmin_history_apply_page(
  p_lease_token uuid,
  p_offset integer,
  p_received integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_state public.garmin_history_backfill_state%rowtype;
  v_row jsonb;
  v_id text;
  v_changed integer := 0;
  v_current_count integer;
  v_complete boolean;
begin
  if p_received < 0 or p_received > 50 or p_offset < 0 or
      p_rows is null or jsonb_typeof(p_rows) <> 'array' or
      jsonb_array_length(p_rows) > p_received then
    raise exception 'Invalid activity backfill page';
  end if;

  select * into v_state from public.garmin_history_backfill_state
  where singleton = true for update;
  if not found or v_state.status <> 'active' or
      v_state.lease_token is distinct from p_lease_token or
      v_state.next_offset <> p_offset or
      v_state.lease_until < now() then
    raise exception 'Stale Garmin backfill claim';
  end if;

  if p_received > 0 and jsonb_array_length(p_rows) = 0 then
    raise exception 'Garmin page contained no usable activity IDs';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_id := v_row->>'activity_id';
    if v_id is null or v_id !~ '^\d+$' then
      raise exception 'Garmin backfill invalid activity ID';
    end if;

    insert into public.garmin_activities (
      activity_id, activity_name, start_time_local, sport_type,
      distance_m, duration_s, average_heart_rate, raw_activity, synced_at
    ) values (
      v_id,
      coalesce(nullif(v_row->>'activity_name', ''), 'Aktivitaet'),
      nullif(v_row->>'start_time_local', ''),
      nullif(v_row->>'sport_type', ''),
      (v_row->>'distance_m')::double precision,
      (v_row->>'duration_s')::double precision,
      (v_row->>'average_heart_rate')::double precision,
      coalesce(v_row->'raw_activity', '{}'::jsonb),
      now()
    ) on conflict (activity_id) do update set
      activity_name = excluded.activity_name,
      start_time_local = coalesce(excluded.start_time_local, public.garmin_activities.start_time_local),
      sport_type = coalesce(excluded.sport_type, public.garmin_activities.sport_type),
      distance_m = coalesce(excluded.distance_m, public.garmin_activities.distance_m),
      duration_s = coalesce(excluded.duration_s, public.garmin_activities.duration_s),
      average_heart_rate = coalesce(excluded.average_heart_rate, public.garmin_activities.average_heart_rate),
      -- A shallow merge preserves summaryDTO / existing detail payloads.
      raw_activity = public.garmin_activities.raw_activity || excluded.raw_activity,
      synced_at = now();

    v_changed := v_changed + 1;
  end loop;

  v_complete := (p_received = 0);
  update public.garmin_history_backfill_state
  set next_offset = p_offset + p_received,
      scanned_count = scanned_count + p_received,
      upserted_count = upserted_count + v_changed,
      batch_count = batch_count + 1,
      last_success_at = now(),
      last_error = null,
      consecutive_failures = 0,
      retry_after = null,
      lease_token = null,
      lease_until = null,
      status = case when v_complete then 'complete' else 'active' end,
      completed_at = case when v_complete then now() else null end,
      updated_at = now()
  where singleton = true
  returning scanned_count into v_current_count;

  return jsonb_build_object(
    'complete', v_complete,
    'next_offset', p_offset + p_received,
    'scanned_total', v_current_count,
    'upserted_this_page', v_changed
  );
end
$body$;
revoke all on function public.garmin_history_apply_page(uuid,integer,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.garmin_history_apply_page(uuid,integer,integer,jsonb)
  to service_role;

-- Retry transient faults with backoff. Pause after 5 consecutive failures.
create or replace function public.garmin_history_fail(
  p_lease_token uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $body$
begin
  update public.garmin_history_backfill_state
  set consecutive_failures = consecutive_failures + 1,
      status = case when consecutive_failures + 1 >= 5 then 'paused' else 'active' end,
      retry_after = now() + (interval '10 minutes' * power(2.0, least(consecutive_failures, 4))),
      last_error = left(coalesce(p_reason,'unknown'), 180),
      lease_token = null,
      lease_until = null,
      updated_at = now()
  where singleton = true and lease_token = p_lease_token;
end
$body$;
revoke all on function public.garmin_history_fail(uuid,text)
  from public, anon, authenticated;
grant execute on function public.garmin_history_fail(uuid,text) to service_role;

-- Dispatch only while active; Vault secret stays in Postgres and is not logged.
create or replace function garmin_private.dispatch_garmin_history()
returns bigint
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_secret text;
  v_id bigint;
begin
  if not exists (
    select 1 from public.garmin_history_backfill_state
    where singleton = true and status = 'active'
      and (retry_after is null or retry_after <= now())
      and (lease_until is null or lease_until < now())
  ) then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'garmin_ai_cron_token';
  if v_secret is null or length(v_secret) <> 64 then
    raise exception 'GARMIN_AI Vault scheduler token unavailable';
  end if;

  select net.http_post(
    url := 'https://eurgupsebxypjqvyizci.supabase.co/functions/v1/backfill-garmin-history',
    headers := jsonb_build_object('Content-Type','application/json', 'x-garmin-sync-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) into v_id;
  return v_id;
end
$body$;
revoke all on function garmin_private.dispatch_garmin_history()
  from public, anon, authenticated;

-- One bounded Garmin page every five minutes; runs independently of live sync.
select cron.schedule(
  'garmin-ai-history-every-5min',
  '*/5 * * * *',
  'select garmin_private.dispatch_garmin_history();'
);

-- Trigger the first page after the migration transaction commits.
select garmin_private.dispatch_garmin_history();

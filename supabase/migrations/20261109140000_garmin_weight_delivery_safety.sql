-- GARMIN_AI v0.9.0: safe single-shot Garmin weight delivery primitives.
-- This migration does NOT schedule jobs, read Garmin, or transmit data.
-- Existing pending measurements are preserved.
alter table public.garmin_weight_outbox
  add column if not exists attempt_id uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz;

alter table public.garmin_weight_outbox
  add constraint garmin_weight_attempt_count_valid
  check (attempt_count between 0 and 100);

create unique index if not exists garmin_weight_outbox_attempt_id_idx
  on public.garmin_weight_outbox(attempt_id)
  where attempt_id is not null;

comment on column public.garmin_weight_outbox.attempt_id is
  'Unique delivery claim. Presence blocks automatic re-sending after an uncertain write.';
comment on column public.garmin_weight_outbox.attempt_count is
  'Number of claimed writes, not number of verified Garmin confirmations.';

-- Service-role only; excludes older entries from unattended processing.
create or replace function public.garmin_weight_next_pending()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.garmin_weight_outbox%rowtype;
begin
  select * into v_row
  from public.garmin_weight_outbox
  where state='pending'
    and attempt_id is null
    and attempt_count=0
    and weigh_date between (current_timestamp at time zone 'Europe/Berlin')::date - 14
                       and (current_timestamp at time zone 'Europe/Berlin')::date
  order by weigh_date asc
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object('available',false);
  end if;
  return pg_catalog.jsonb_build_object(
    'available',true,'date',v_row.weigh_date,
    'kg',v_row.weight_kg,'revision',v_row.updated_at
  );
end
$$;

-- Atomic claim: no other worker may send the same date, value or attempt.
-- Do not call until Garmin's dayview was successfully read as an empty day.
create or replace function public.garmin_weight_claim(
  p_date date, p_kg numeric, p_revision timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.garmin_weight_outbox%rowtype;
begin
  update public.garmin_weight_outbox
  set state='sending',attempt_id=pg_catalog.gen_random_uuid(),
      attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
      updated_at=clock_timestamp()
  where weigh_date=p_date
    and weight_kg=p_kg
    and updated_at=p_revision
    and state='pending'
    and attempt_id is null
    and attempt_count=0
  returning * into v_row;

  if not found then
    return pg_catalog.jsonb_build_object('claimed',false,'reason','changed_or_already_claimed');
  end if;
  return pg_catalog.jsonb_build_object(
    'claimed',true,'date',v_row.weigh_date,
    'kg',v_row.weight_kg,'attemptId',v_row.attempt_id
  );
end
$$;

-- Never allow failed/uncertain attempts to go back to pending
-- automatically. Retrying could duplicate a committed Garmin weigh-in.
create or replace function public.garmin_weight_finish(
  p_date date,p_attempt_id uuid,p_status text,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.garmin_weight_outbox%rowtype;
begin
  if p_status not in ('confirmed','needs_review') or
     p_reason not in (
       'verified_read_back','already_present',
       'auth_rejected','rate_limited','network_uncertain',
       'garmin_response_invalid','write_not_visible','invalid_garmin_day',
       'different_remote_weight','multiple_remote_entries',
       'write_error','manual_review'
     )
     or (p_status='confirmed' and p_reason not in
         ('verified_read_back','already_present'))
     or (p_status='needs_review' and p_reason in
         ('verified_read_back','already_present'))
  then
    return pg_catalog.jsonb_build_object('saved',false,'reason','invalid_outcome');
  end if;

  update public.garmin_weight_outbox
  set state=p_status,
      last_error_code=case when p_status='confirmed' then null else p_reason end,
      confirmed_at=case when p_status='confirmed' then clock_timestamp() else null end,
      updated_at=clock_timestamp()
  where weigh_date=p_date
    and attempt_id=p_attempt_id
    and state='sending'
  returning * into v_row;

  return pg_catalog.jsonb_build_object('saved',found,'state',
    case when found then v_row.state else null end);
end
$$;

-- Verified existing Garmin record (pre-write) requires no "sending" claim.
-- The target weight and revision are checked atomically. A mismatch is
-- retained as pending for explicit manual review (not overwritten).
create or replace function public.garmin_weight_confirm_existing(
  p_date date,p_kg numeric,p_revision timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.garmin_weight_outbox%rowtype;
begin
  update public.garmin_weight_outbox
  set state='confirmed',confirmed_at=clock_timestamp(),
      last_error_code=null,updated_at=clock_timestamp()
  where weigh_date=p_date and weight_kg=p_kg
    and updated_at=p_revision
    and state='pending' and attempt_id is null and attempt_count=0
  returning * into v_row;
  return pg_catalog.jsonb_build_object('saved',found);
end
$$;

revoke all on function public.garmin_weight_next_pending()
  from public,anon,authenticated;
revoke all on function public.garmin_weight_claim(date,numeric,timestamptz)
  from public,anon,authenticated;
revoke all on function public.garmin_weight_finish(date,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.garmin_weight_confirm_existing(date,numeric,timestamptz)
  from public,anon,authenticated;

grant execute on function public.garmin_weight_next_pending() to service_role;
grant execute on function public.garmin_weight_claim(date,numeric,timestamptz) to service_role;
grant execute on function public.garmin_weight_finish(date,uuid,text,text) to service_role;
grant execute on function public.garmin_weight_confirm_existing(date,numeric,timestamptz)
  to service_role;

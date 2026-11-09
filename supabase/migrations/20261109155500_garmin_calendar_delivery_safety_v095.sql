-- GARMIN_AI v0.9.5: one-at-a-time, manually approved workout calendar delivery.
-- Only service-role RPC access; no user/browser direct SQL writes.
alter table public.garmin_training_plan
 add column if not exists attempt_id uuid;

create unique index if not exists garmin_training_plan_remote_idx
  on public.garmin_training_plan(garmin_remote_id)
  where garmin_remote_id is not null and state='confirmed';

-- Return exactly one approved, not-yet-tried Garmin workout for the next 90 days.
-- Generic "event" entries are deliberately excluded (no validated Garmin writer).
create or replace function public.garmin_calendar_next_pending()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.garmin_training_plan%rowtype;
begin
 select * into r from public.garmin_training_plan
 where state='pending' and session_type='workout'
   and garmin_workout_id>0 and attempt_count=0
   and training_date>=(clock_timestamp() at time zone 'Europe/Berlin')::date
   and training_date<=(clock_timestamp() at time zone 'Europe/Berlin')::date+90
 order by training_date,created_at limit 1;
 if not found then return pg_catalog.jsonb_build_object('available',false); end if;
 return pg_catalog.jsonb_build_object(
   'available',true,'id',r.id,'revision',r.revision,
   'date',r.training_date,'workoutId',r.garmin_workout_id
 );
end;$$;

create or replace function public.garmin_calendar_claim(
 p_id uuid,p_revision integer,p_date date,p_workout_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt uuid;
begin
 update public.garmin_training_plan
 set state='sending',attempt_count=attempt_count+1,
     attempt_id=pg_catalog.gen_random_uuid(),updated_at=now()
 where id=p_id and revision=p_revision and state='pending'
   and session_type='workout' and approved_at is not null
   and training_date=p_date and garmin_workout_id=p_workout_id
   and training_date>=(clock_timestamp() at time zone 'Europe/Berlin')::date and training_date<=(clock_timestamp() at time zone 'Europe/Berlin')::date+90
   and attempt_count=0
 returning attempt_id into v_attempt;
 return pg_catalog.jsonb_build_object(
   'claimed',v_attempt is not null,'attemptId',v_attempt);
end;$$;

-- A preexisting matching Garmin workout is reconciliation, not a new write.
create or replace function public.garmin_calendar_confirm_existing(
 p_id uuid,p_revision integer,p_date date,p_workout_id bigint,p_remote_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_changed integer;
begin
 if p_remote_id is null or p_remote_id !~ '^[1-9][0-9]{0,18}$'
 then return pg_catalog.jsonb_build_object('saved',false); end if;
 update public.garmin_training_plan
 set state='confirmed',garmin_remote_id=p_remote_id,
     confirmed_at=now(),last_error_code=null,updated_at=now()
 where id=p_id and revision=p_revision and state='pending'
   and approved_at is not null and attempt_count=0
   and session_type='workout' and garmin_workout_id=p_workout_id
   and training_date=p_date;
 get diagnostics v_changed = row_count;
 return pg_catalog.jsonb_build_object('saved',v_changed=1);
end;$$;

-- A single successful write needs independent read-back of the remote ID.
-- Uncertain writes are never silently retried: always needs_review.
create or replace function public.garmin_calendar_finish(
 p_id uuid,p_attempt_id uuid,p_status text,p_code text,p_remote_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_changed integer;
begin
 if p_status not in ('confirmed','needs_review') or
    p_code not in ('verified_read_back','multiple_matches','already_present',
                   'read_unavailable','write_unavailable','rate_limited',
                   'auth_rejected','network_uncertain','write_not_visible',
                   'unexpected_remote_shape','manual_review')
 then return pg_catalog.jsonb_build_object('saved',false); end if;
 if p_status='confirmed' and (
    p_code<>'verified_read_back' or
    p_remote_id is null or p_remote_id !~ '^[1-9][0-9]{0,18}$')
 then return pg_catalog.jsonb_build_object('saved',false); end if;
 update public.garmin_training_plan
 set state=p_status,
     confirmed_at=case when p_status='confirmed' then now() else null end,
     garmin_remote_id=case when p_status='confirmed' then p_remote_id else null end,
     last_error_code=case when p_status='needs_review' then p_code else null end,
     attempt_id=null,updated_at=now()
 where id=p_id and state='sending' and attempt_id=p_attempt_id
   and attempt_count=1
 returning 1 into v_changed;
 return pg_catalog.jsonb_build_object('saved',v_changed=1);
end;$$;

revoke all on function public.garmin_calendar_next_pending() from public,anon,authenticated;
revoke all on function public.garmin_calendar_claim(uuid,integer,date,bigint) from public,anon,authenticated;
revoke all on function public.garmin_calendar_confirm_existing(uuid,integer,date,bigint,text) from public,anon,authenticated;
revoke all on function public.garmin_calendar_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.garmin_calendar_next_pending() to service_role;
grant execute on function public.garmin_calendar_claim(uuid,integer,date,bigint) to service_role;
grant execute on function public.garmin_calendar_confirm_existing(uuid,integer,date,bigint,text) to service_role;
grant execute on function public.garmin_calendar_finish(uuid,uuid,text,text,text) to service_role;

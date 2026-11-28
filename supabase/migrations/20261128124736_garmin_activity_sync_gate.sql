-- One per-project gate shared by scheduled and owner-triggered activity import.
create table if not exists public.garmin_activity_sync_gate (
 id boolean primary key default true check (id),
 next_allowed_at timestamptz not null default '-infinity'
);
alter table public.garmin_activity_sync_gate enable row level security;
revoke all on public.garmin_activity_sync_gate from public, anon, authenticated;
grant select, insert, update on public.garmin_activity_sync_gate to service_role;
insert into public.garmin_activity_sync_gate(id) values (true) on conflict do nothing;
create or replace function public.garmin_claim_activity_sync()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 t timestamptz;
begin
 update public.garmin_activity_sync_gate
 set next_allowed_at = clock_timestamp() + interval '5 minutes'
 where id and next_allowed_at <= clock_timestamp()
 returning next_allowed_at into t;
 if found then return jsonb_build_object('allowed',true,'retryAt',t); end if;
 select next_allowed_at into t from public.garmin_activity_sync_gate where id;
 if t is null then raise exception 'activity sync gate unavailable'; end if;
 return jsonb_build_object('allowed',false,'retryAt',t);
end;
$$;
revoke all on function public.garmin_claim_activity_sync() from public, anon, authenticated;
grant execute on function public.garmin_claim_activity_sync() to service_role;

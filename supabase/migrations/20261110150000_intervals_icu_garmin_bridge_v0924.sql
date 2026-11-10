-- GARMIN_AI v0.9.24: Intervals.icu is the ONLY workout writer.
-- Garmin Personal API remains read-only. No Garmin OAuth dependence.
create table if not exists public.garmin_intervals_connection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_secret_id uuid not null unique,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.garmin_intervals_connection enable row level security;
revoke all on public.garmin_intervals_connection from public, anon, authenticated;
grant select,insert,update,delete on public.garmin_intervals_connection to service_role;

alter table public.garmin_training_plan
  add column if not exists intervals_event_id bigint,
  add column if not exists intervals_published_at timestamptz,
  add column if not exists intervals_published_revision integer,
  add column if not exists intervals_sync_status text not null default 'not_published';
alter table public.garmin_training_plan
  drop constraint if exists garmin_training_plan_intervals_sync_status_check;
alter table public.garmin_training_plan
  add constraint garmin_training_plan_intervals_sync_status_check
  check (intervals_sync_status in ('not_published','confirmed','needs_review'));

-- These RPCs must NEVER be callable with a user JWT. Edge verifies the
-- owner JWT and uses a server-only key; Vault plaintext never reaches browser.
create or replace function public.garmin_intervals_key_put(p_user_id uuid,p_api_key text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_secret_id uuid;
begin
  if p_user_id is null or p_api_key is null or length(p_api_key) not between 12 and 300
     or p_api_key ~ '[[:space:]]' then
    return false;
  end if;
  select c.vault_secret_id into v_secret_id
  from public.garmin_intervals_connection c
  where c.user_id = p_user_id for update;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_api_key);
  else
    perform vault.update_secret(v_secret_id,p_api_key);
  end if;
  insert into public.garmin_intervals_connection(user_id,vault_secret_id,updated_at)
  values(p_user_id,v_secret_id,now())
  on conflict (user_id) do update
  set vault_secret_id=excluded.vault_secret_id, updated_at=now();
  return true;
end;
$$;

create or replace function public.garmin_intervals_key_get(p_user_id uuid)
returns text language sql security definer set search_path = ''
as $$
  select v.decrypted_secret from public.garmin_intervals_connection c
  join vault.decrypted_secrets v on v.id=c.vault_secret_id
  where c.user_id=p_user_id
  limit 1
$$;

create or replace function public.garmin_intervals_key_delete(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_secret_id uuid;
begin
  delete from public.garmin_intervals_connection
  where user_id=p_user_id returning vault_secret_id into v_secret_id;
  if v_secret_id is null then return false; end if;
  delete from vault.secrets where id=v_secret_id;
  return true;
end;
$$;

revoke all on function public.garmin_intervals_key_put(uuid,text) from public, anon, authenticated;
revoke all on function public.garmin_intervals_key_get(uuid) from public, anon, authenticated;
revoke all on function public.garmin_intervals_key_delete(uuid) from public, anon, authenticated;
grant execute on function public.garmin_intervals_key_put(uuid,text) to service_role;
grant execute on function public.garmin_intervals_key_get(uuid) to service_role;
grant execute on function public.garmin_intervals_key_delete(uuid) to service_role;

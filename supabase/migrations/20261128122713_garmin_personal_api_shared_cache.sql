-- Separate official Personal API cache, not Garmin Connect cloud OAuth.
-- Only the trusted service role can call this state machine. Vault encrypts
-- the bearer at rest. Fingerprints separate changed API keys and projects.
create table if not exists public.garmin_personal_api_state (
 fingerprint text primary key check (fingerprint ~ '^[a-f0-9]{64}$'),
 secret_id uuid,
 generation uuid,
 expires_at timestamptz,
 refresh_lease uuid,
 refresh_until timestamptz,
 blocked_until timestamptz,
 exchanges bigint not null default 0,
 rate_limits bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.garmin_personal_api_state enable row level security;
revoke all on public.garmin_personal_api_state from public,anon,authenticated;
grant select,insert,update on public.garmin_personal_api_state to service_role;
create or replace function public.garmin_personal_api_control(
 p_fingerprint text, p_action text, p_lease uuid default null,
 p_token text default null, p_expires_at timestamptz default null,
 p_retry_seconds integer default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v public.garmin_personal_api_state%rowtype;
 t timestamptz := clock_timestamp();
 l uuid;
 token_value text;
begin
 if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or
    p_action is null or p_action not in ('ready','acquire','check','store','fail','backoff','invalidate')
 then raise exception 'invalid personal API control request'; end if;
 if p_action in ('acquire','backoff') then
  insert into public.garmin_personal_api_state(fingerprint) values(p_fingerprint) on conflict do nothing;
 end if;
 select * into v from public.garmin_personal_api_state where fingerprint=p_fingerprint for update;
 if not found then return jsonb_build_object('status',case when p_action='ready' then 'ready' else 'stale' end); end if;
 if p_action='backoff' then
  if p_retry_seconds is null or p_retry_seconds<1 then raise exception 'invalid retry interval'; end if;
  update public.garmin_personal_api_state set
   blocked_until=greatest(coalesce(blocked_until,t),t+make_interval(secs=>greatest(3600,p_retry_seconds))),
   rate_limits=rate_limits+1,updated_at=t where fingerprint=p_fingerprint;
  return jsonb_build_object('status','ok');
 end if;
 if p_action='fail' then
  if v.refresh_lease=p_lease then
   update public.garmin_personal_api_state set refresh_lease=null,refresh_until=null,
    blocked_until=greatest(coalesce(blocked_until,t),t+interval '1 minute'),updated_at=t
    where fingerprint=p_fingerprint;
  end if;
  return jsonb_build_object('status','ok');
 end if;
 if p_action='invalidate' then
  if v.generation=p_lease then
   update public.garmin_personal_api_state set generation=null,expires_at=null,
    blocked_until=greatest(coalesce(blocked_until,t),t+interval '1 minute'),updated_at=t
    where fingerprint=p_fingerprint;
  end if;
  return jsonb_build_object('status','ok');
 end if;
 if v.blocked_until>t then return jsonb_build_object('status','blocked','until',v.blocked_until); end if;
 if p_action='ready' then
  return jsonb_build_object('status',case when v.refresh_until>t and (v.expires_at is null or v.expires_at<=t) then 'busy' else 'ready' end);
 end if;
 if p_action='check' then
  return jsonb_build_object('status',case when v.generation=p_lease and v.expires_at>t then 'ready' else 'stale' end);
 end if;
 if p_action='store' then
  if p_lease is null or v.refresh_lease is distinct from p_lease or v.refresh_until<=t then return jsonb_build_object('status','stale'); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_+/.=-]{20,4096}$' or
    p_expires_at is null or p_expires_at<=t+interval '30 seconds' or p_expires_at>t+interval '23 hours 1 minute'
  then raise exception 'invalid personal API token payload'; end if;
  if v.secret_id is null then
   l:=vault.create_secret(p_token,null,'Garmin Personal API temporary bearer cache');
  else
   l:=v.secret_id;
   perform vault.update_secret(l,p_token);
  end if;
  update public.garmin_personal_api_state set secret_id=l,generation=p_lease,expires_at=p_expires_at,
   refresh_lease=null,refresh_until=null,exchanges=exchanges+1,updated_at=t where fingerprint=p_fingerprint;
  return jsonb_build_object('status','ok');
 end if;
 if v.secret_id is not null and v.generation is not null and v.expires_at>t then
  select decrypted_secret into token_value from vault.decrypted_secrets where id=v.secret_id;
  if token_value is not null then return jsonb_build_object('status','cached','token',token_value,'generation',v.generation); end if;
 end if;
 if v.refresh_until>t then return jsonb_build_object('status','busy'); end if;
 l:=gen_random_uuid();
 update public.garmin_personal_api_state set refresh_lease=l,refresh_until=t+interval '60 seconds',updated_at=t where fingerprint=p_fingerprint;
 return jsonb_build_object('status','refresh','lease',l);
end;
$$;
revoke all on function public.garmin_personal_api_control(text,text,uuid,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.garmin_personal_api_control(text,text,uuid,text,timestamptz,integer) to service_role;

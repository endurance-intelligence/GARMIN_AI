-- GARMIN_AI v0.7.6: encrypted Garmin Connect OAuth session in Supabase Vault.
-- Does not store ANY actual credentials during migration. Only a deliberately
-- approved bootstrap can create the secret. No Garmin writes or cron jobs.
create schema if not exists garmin_private;

create table if not exists garmin_private.connect_session (
    singleton smallint primary key default 1 check (singleton = 1),
    secret_id uuid not null,
    version bigint not null default 1 check (version > 0),
    updated_at timestamptz not null default now()
);
revoke all on garmin_private.connect_session from public,anon,authenticated;
comment on table garmin_private.connect_session is
    'Only Vault secret ID and rotation version; actual OAuth tokens live encrypted in Vault.';

-- Readable ONLY with the service_role and only from a trusted server.
-- Returning OAuth tokens to browsers, authenticated users or anon is forbidden.
create or replace function public.garmin_connect_session_get()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_version bigint;
  v_secret_id uuid;
  v_secret text;
begin
  select version, secret_id into v_version, v_secret_id
  from garmin_private.connect_session where singleton = 1;
  if v_secret_id is null then
    return pg_catalog.jsonb_build_object('connected',false);
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where id = v_secret_id;
  if v_secret is null then
    raise exception 'Garmin cloud secret unavailable';
  end if;
  return pg_catalog.jsonb_build_object(
    'connected', true, 'version', v_version, 'tokens', v_secret::jsonb
  );
end
$$;
revoke all on function public.garmin_connect_session_get()
  from public,anon,authenticated;
grant execute on function public.garmin_connect_session_get() to service_role;

-- Exactly one service-side writer; optimistic version protects refresh races.
-- Expected version=0 installs the first session, otherwise rotates it.
create or replace function public.garmin_connect_session_store(
  p_tokens jsonb,p_expected_version bigint
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row garmin_private.connect_session%rowtype;
  v_secret_id uuid;
  v_new_version bigint;
begin
  if p_tokens is null
    or pg_catalog.jsonb_typeof(p_tokens) <> 'object'
    or pg_catalog.jsonb_typeof(p_tokens->'oauth1') <> 'object'
    or pg_catalog.jsonb_typeof(p_tokens->'oauth2') <> 'object'
    or pg_catalog.length(p_tokens::text) > 20000
    or pg_catalog.length(coalesce(p_tokens #>> '{oauth1,oauth_token}','')) < 10
    or pg_catalog.length(coalesce(p_tokens #>> '{oauth1,oauth_token_secret}','')) < 10
    or pg_catalog.length(coalesce(p_tokens #>> '{oauth2,access_token}','')) < 10
    or pg_catalog.length(coalesce(p_tokens #>> '{oauth2,refresh_token}','')) < 10
    or pg_catalog.jsonb_typeof(p_tokens #> '{oauth2,expires_at}') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_tokens #> '{oauth2,refresh_token_expires_at}') is distinct from 'number'
  then
    raise exception 'Invalid Garmin OAuth session format';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(73611577, 1);
  select * into v_row
  from garmin_private.connect_session
  where singleton = 1
  for update;
  if not found then
    if p_expected_version is distinct from 0 then
      raise exception 'Garmin session version conflict';
    end if;
    v_secret_id := vault.create_secret(
      p_tokens::text, 'garmin_ai_connect_oauth_v1',
      'Private Garmin Connect OAuth session; never expose to browser'
    );
    insert into garmin_private.connect_session(singleton,secret_id,version)
    values (1,v_secret_id,1);
    v_new_version := 1;
  else
    if p_expected_version is distinct from v_row.version then
      raise exception 'Garmin session version conflict';
    end if;
    perform vault.update_secret(v_row.secret_id,p_tokens::text);
    update garmin_private.connect_session
      set version = version + 1, updated_at = now()
      where singleton = 1
      returning version into v_new_version;
  end if;
  return pg_catalog.jsonb_build_object('saved',true,'version',v_new_version);
end
$$;
revoke all on function public.garmin_connect_session_store(jsonb,bigint)
  from public,anon,authenticated;
grant execute on function public.garmin_connect_session_store(jsonb,bigint)
  to service_role;

-- Safe status endpoint for server-side monitoring. No decrypted secret output.
create or replace function public.garmin_connect_session_state()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row garmin_private.connect_session%rowtype;
begin
  select * into v_row from garmin_private.connect_session
  where singleton=1;
  if not found then
    return pg_catalog.jsonb_build_object('connected',false);
  end if;
  return pg_catalog.jsonb_build_object(
    'connected',true,'version',v_row.version,'updatedAt',v_row.updated_at
  );
end
$$;
revoke all on function public.garmin_connect_session_state()
  from public,anon,authenticated;
grant execute on function public.garmin_connect_session_state() to service_role;

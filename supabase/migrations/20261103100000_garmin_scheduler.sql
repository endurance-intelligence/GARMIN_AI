-- GARMIN_AI v0.3.1: private recurring Garmin import, every 3h (UTC).
-- Everything stays in the GARMIN_AI Supabase project; no EI Classic objects.
-- A random 256-bit token is generated inside Postgres, encrypted at rest
-- by Supabase Vault, and never appears in this migration or its history.

create schema if not exists extensions;
create schema if not exists vault;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- pg_cron on hosted Supabase normally runs as postgres.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create schema if not exists garmin_private;
revoke all on schema garmin_private from public, anon, authenticated;

-- Create only if missing, retaining an already-installed token on re-run.
do $setup$
begin
  if not exists (select 1 from vault.secrets where name = 'garmin_ai_cron_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'garmin_ai_cron_token',
      'GARMIN_AI scheduled Edge Function shared token'
    );
  end if;
end
$setup$;

-- Called by Edge Function with server-side Supabase admin privileges only.
-- Never expose this RPC to anon or authenticated users.
create or replace function public.garmin_verify_cron_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $verify$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'garmin_ai_cron_token'
      and decrypted_secret = p_token
  );
$verify$;
revoke all on function public.garmin_verify_cron_token(text)
  from public, anon, authenticated;
grant execute on function public.garmin_verify_cron_token(text) to service_role;

create or replace function garmin_private.dispatch_garmin_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $dispatch$
declare
  token_value text;
  request_id bigint;
begin
  select decrypted_secret into token_value
    from vault.decrypted_secrets
   where name = 'garmin_ai_cron_token';
  if token_value is null or length(token_value) <> 64 then
    raise exception 'GARMIN_AI scheduler Vault token missing';
  end if;

  select net.http_post(
    url := 'https://eurgupsebxypjqvyizci.supabase.co/functions/v1/sync-garmin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-garmin-sync-secret', token_value
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) into request_id;
  return request_id;
end
$dispatch$;
revoke all on function garmin_private.dispatch_garmin_sync()
  from public, anon, authenticated;

-- 8 runs/day at minute 15 (UTC), with name-based idempotent schedule.
select cron.schedule(
  'garmin-ai-activities-every-3h',
  '15 */3 * * *',
  'select garmin_private.dispatch_garmin_sync();'
);

-- Request one immediate test; pg_net sends once the migration commits.
select garmin_private.dispatch_garmin_sync();

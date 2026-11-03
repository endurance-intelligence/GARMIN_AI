-- GARMIN_AI v0.4.0: Daily Garmin health sync.
-- Reuses existing private garmin_daily_metrics table and Vault-backed token.
-- Does not touch EI Classic or the 3-hour activities scheduler.

create or replace function garmin_private.dispatch_garmin_health_sync()
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
    url := 'https://eurgupsebxypjqvyizci.supabase.co/functions/v1/sync-garmin-health',
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

revoke all on function garmin_private.dispatch_garmin_health_sync()
  from public, anon, authenticated;

-- One daily run at 06:25 UTC; reads today and previous 15 days to pick up
-- delayed uploads and backfilled Garmin health metrics.
select cron.schedule(
  'garmin-ai-health-daily',
  '25 6 * * *',
  'select garmin_private.dispatch_garmin_health_sync();'
);

-- Queue one initial run when the migration commits.
select garmin_private.dispatch_garmin_health_sync();

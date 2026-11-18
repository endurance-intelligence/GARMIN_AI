-- GARMIN_AI v0.9.46: persistent, owner-invisible Garmin OAuth rate-limit backoff.
-- Prevent scheduled GitHub runners and manual audits from repeatedly touching
-- Garmin while a 429 cooldown is active. No OAuth secrets are stored here.
create table if not exists public.garmin_cloud_backoff (
  id text primary key check (id = 'garmin'),
  retry_after timestamptz,
  last_limited_at timestamptz,
  consecutive_429 integer not null default 0 check (consecutive_429 between 0 and 3),
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.garmin_cloud_backoff enable row level security;
revoke all on table public.garmin_cloud_backoff from anon, authenticated;
grant select, insert, update on table public.garmin_cloud_backoff to service_role;
insert into public.garmin_cloud_backoff(id) values ('garmin') on conflict (id) do nothing;
comment on table public.garmin_cloud_backoff is
 'Private rate-limit protection for trusted GitHub OIDC Garmin reads. No access tokens, email, or user identifiers.';

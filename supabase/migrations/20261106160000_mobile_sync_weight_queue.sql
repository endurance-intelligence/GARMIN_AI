-- GARMIN_AI v0.7.4: single-user, private weight outbox.
-- Entry is stored first. It is NOT marked transmitted until a separate
-- verified Garmin Connect writer proves the remote value was recorded.
-- No automatic Garmin writes and no changes to existing activity/FIT cron jobs.
create table if not exists public.garmin_weight_outbox (
  weigh_date date primary key,
  weight_kg numeric(5,2) not null check (weight_kg between 30 and 300),
  state text not null default 'pending' check (state in ('pending','sending','confirmed','needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_error_code text
);
alter table public.garmin_weight_outbox enable row level security;
revoke all on table public.garmin_weight_outbox from public, anon, authenticated;
grant all on table public.garmin_weight_outbox to service_role;
comment on table public.garmin_weight_outbox is
'Private Garmin weight transfer outbox. Pending is not confirmation of a Garmin weigh-in.';

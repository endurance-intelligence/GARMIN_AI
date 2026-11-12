-- GARMIN_AI Coach v1.1: user-declared illness, gradual return and unavailable dates.
-- No diagnoses, no automatic training clearance, no direct client SQL access.
create table if not exists public.garmin_coach_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  illness_state text not null default 'well'
    check (illness_state in ('well','sick','returning')),
  illness_started_on date,
  return_started_on date,
  blocked_periods jsonb not null default '[]'::jsonb
    check (jsonb_typeof(blocked_periods)='array'),
  run_reviews jsonb not null default '[]'::jsonb
    check (jsonb_typeof(run_reviews)='array'),
  updated_at timestamptz not null default now()
);
comment on table public.garmin_coach_context is
 'Owner-only self-reported training interruption and availability. Not medical diagnosis or training clearance. All reads/writes via authenticated owner Edge API.';
alter table public.garmin_coach_context enable row level security;
revoke all on public.garmin_coach_context from anon, authenticated;

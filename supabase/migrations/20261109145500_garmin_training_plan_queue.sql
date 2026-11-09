-- GARMIN_AI v0.9.4: source-of-truth for coach-approved Garmin calendar plans.
-- No Garmin API writes. Drafts are explicitly approved before delivery.
create table if not exists public.garmin_training_plan (
  id uuid primary key default gen_random_uuid(),
  training_date date not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  session_type text not null check (session_type in ('workout','event')),
  sport text not null default 'running'
    check (sport in ('running','cycling','strength','other','rest')),
  garmin_workout_id bigint,
  notes text not null default '' check (length(notes) <= 500),
  state text not null default 'draft'
    check (state in ('draft','pending','sending','confirmed','needs_review','cancelled')),
  revision integer not null default 1 check (revision > 0),
  client_request_id uuid not null unique,
  garmin_remote_id text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  last_error_code text,
  approved_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garmin_plan_workout_id_valid check (
    (session_type='workout' and garmin_workout_id > 0)
    or (session_type='event' and garmin_workout_id is null)
  ),
  constraint garmin_plan_remote_id_valid check (
    garmin_remote_id is null or length(garmin_remote_id) between 1 and 100
  ),
  constraint garmin_plan_confirmation_consistency check (
    state <> 'confirmed' or (garmin_remote_id is not null and confirmed_at is not null)
  )
);
alter table public.garmin_training_plan enable row level security;
revoke all on table public.garmin_training_plan from public,anon,authenticated;
grant select,insert,update on table public.garmin_training_plan to service_role;
create index if not exists garmin_training_plan_queue_idx
  on public.garmin_training_plan(training_date,created_at)
  where state='pending';
comment on table public.garmin_training_plan is
 'Owner-only coach training drafts and approved Garmin calendar outbox. No direct client SQL access; only authenticated owner Edge API.';

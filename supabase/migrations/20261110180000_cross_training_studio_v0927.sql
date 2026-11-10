-- GARMIN_AI v0.9.27: manual complementary sessions, independent of Garmin.
-- Garmin-imported workouts remain source-of-truth; no duplicate automatic entries.
create table if not exists public.garmin_cross_training_sessions(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 client_request_id uuid not null unique,
 session_date date not null,
 kind text not null check(kind in ('strength','mobility','rowing')),
 duration_minutes smallint not null check(duration_minutes between 5 and 240),
 rowing_distance_m integer check(rowing_distance_m is null or rowing_distance_m between 500 and 100000),
 rpe smallint check(rpe is null or rpe between 1 and 10),
 exercise_ids text[] not null default '{}'::text[],
 note text not null default '' check(length(note)<=400),
 created_at timestamptz not null default now()
);
create index if not exists garmin_cross_training_user_date_idx
 on public.garmin_cross_training_sessions(user_id,session_date desc);
alter table public.garmin_cross_training_sessions enable row level security;
revoke all on public.garmin_cross_training_sessions from public,anon,authenticated;
grant select,insert on public.garmin_cross_training_sessions to service_role;

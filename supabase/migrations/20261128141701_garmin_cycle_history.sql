create table public.garmin_cycle_history (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 generation uuid not null default gen_random_uuid(),
 last_attempt_on date,
 status text not null default 'idle' check(status in ('idle','pending','stored','unavailable')),
 observations jsonb not null default '[]'::jsonb check(jsonb_typeof(observations)='array' and jsonb_array_length(observations)<=180),
 updated_at timestamptz not null default now(),
 check(enabled or (observations='[]'::jsonb and last_attempt_on is null))
);
alter table public.garmin_cycle_history enable row level security;
revoke all on public.garmin_cycle_history from public, anon, authenticated;
grant select,insert,update,delete on public.garmin_cycle_history to service_role;

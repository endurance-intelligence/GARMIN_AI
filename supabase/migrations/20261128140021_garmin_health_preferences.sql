create table public.garmin_health_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 height_cm numeric(5,1) check(height_cm between 100 and 250),
 birth_year integer check(birth_year between 1900 and 2200),
 adult_confirmed boolean not null default false,
 weigh_reminder text not null default 'off' check(weigh_reminder in ('off','daily','three-weekly')),
 dismissed_date date,
 updated_at timestamptz not null default now()
);
alter table public.garmin_health_preferences enable row level security;
revoke all on public.garmin_health_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.garmin_health_preferences to service_role;

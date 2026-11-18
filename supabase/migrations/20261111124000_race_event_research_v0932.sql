-- GARMIN_AI: verified, owner-reviewed event research for any future race.
-- Distinct from the athlete's personal goal (112 km is a goal, not one lap).
create table if not exists public.garmin_race_event_research (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 race_date date not null,
 event_url text not null check (length(event_url) between 12 and 1500),
 event_title text not null check (length(event_title) between 2 and 150),
 details jsonb not null default '{}'::jsonb,
 evidence jsonb not null default '[]'::jsonb,
 reviewed_at timestamptz not null default now(),
 checked_at timestamptz not null default now(),
 unique (user_id,race_date,event_url)
);
create index if not exists garmin_race_event_research_owner_date
 on public.garmin_race_event_research(user_id,race_date desc);
alter table public.garmin_race_event_research enable row level security;
revoke all on public.garmin_race_event_research from public,anon,authenticated;
grant select,insert,update,delete on public.garmin_race_event_research to service_role;
comment on table public.garmin_race_event_research is
 'Owner-confirmed event facts (date/venue/lap/Komoot link/GPX if publicly linked) with original source references. No automated writes to Garmin or Intervals.';

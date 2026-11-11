-- v0.9.34: recurring race archive: one reviewed canonical event, many annual editions.
-- Annual snapshots remain in garmin_race_event_research; archived route can change.
create table if not exists public.garmin_race_event_archive (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 canonical_url text not null check (char_length(canonical_url) between 12 and 1500),
 event_name text not null check (char_length(event_name) between 2 and 150),
 template_details jsonb not null default '{}'::jsonb,
 evidence jsonb not null default '[]'::jsonb,
 last_race_date date,
 updated_at timestamptz not null default now(),
 unique(user_id, canonical_url)
);
create index if not exists idx_garmin_race_event_archive_owner_time
 on public.garmin_race_event_archive(user_id,updated_at desc);
alter table public.garmin_race_event_archive enable row level security;
revoke all on public.garmin_race_event_archive from public,anon,authenticated;
grant select,insert,update,delete on public.garmin_race_event_archive to service_role;
comment on table public.garmin_race_event_archive is
 'Reusable race series; snapshots by race edition stay independently in garmin_race_event_research. Owner-confirmed only.';

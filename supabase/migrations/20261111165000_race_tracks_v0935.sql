-- Track geometry is saved per edition. A reused route URL can read prior geometry,
-- but changing the new year's course NEVER overwrites earlier edition rows.
create table if not exists public.garmin_race_tracks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 race_date date not null,
 route_url text not null check(length(route_url) between 12 and 1500),
 coordinates jsonb not null,
 distance_m numeric(9,1) not null check(distance_m between 100 and 1000000),
 ascent_m numeric(8,1) not null default 0,
 descent_m numeric(8,1) not null default 0,
 saved_at timestamptz not null default now(),
 unique(user_id,race_date,route_url)
);
create index if not exists idx_garmin_race_tracks_user_route
 on public.garmin_race_tracks(user_id,route_url,race_date desc);
alter table public.garmin_race_tracks enable row level security;
revoke all on public.garmin_race_tracks from public,anon,authenticated;
grant select,insert,update,delete on public.garmin_race_tracks to service_role;

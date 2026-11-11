-- Cache owner-triggered venue geocoding to minimise public Photon requests.
-- No scheduled/bulk searches. Only the user's current goal venue is queried.
create table if not exists public.garmin_race_venue_geocode_cache (
 user_id uuid not null references auth.users(id) on delete cascade,
 query_key text not null check (char_length(query_key) between 4 and 300),
 result jsonb,
 checked_at timestamptz not null default now(),
 primary key (user_id,query_key)
);
alter table public.garmin_race_venue_geocode_cache enable row level security;
revoke all on public.garmin_race_venue_geocode_cache from public,anon,authenticated;
grant select,insert,update,delete on public.garmin_race_venue_geocode_cache to service_role;
comment on table public.garmin_race_venue_geocode_cache is
 'Single-athlete geocoding cache for on-demand race website scans; no autocomplete, no bulk lookup';

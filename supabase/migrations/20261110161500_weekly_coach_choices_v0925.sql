-- v0.9.25b: choose recurring sessions per date, without creating a Garmin workout.
create table if not exists public.garmin_weekly_training_choices (
 training_date date not null,
 option_code text not null references public.garmin_weekly_training_options(code),
 choice text not null check (choice in ('selected','skipped')),
 updated_at timestamptz not null default now(),
 primary key (training_date, option_code)
);
alter table public.garmin_weekly_training_choices enable row level security;
revoke all on public.garmin_weekly_training_choices from PUBLIC,anon,authenticated;
grant select,insert,update,delete on public.garmin_weekly_training_choices to service_role;
-- Correct Oerlinghausen reference coordinates to city center, not a training venue.
update public.garmin_weekly_training_options
set location_lat=51.9604,location_lon=8.6639,updated_at=now()
where code in ('orc-track-tue','orc-run-wed','orc-track-sat');

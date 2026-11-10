-- v0.9.25: recurring, optional weekly training opportunities (no automatic workout booking).
create table if not exists public.garmin_weekly_training_options (
 code text primary key,
 weekday smallint not null check (weekday between 1 and 7),
 start_time time not null,
 timezone text not null default 'Europe/Berlin' check (timezone='Europe/Berlin'),
 title text not null, sport text not null check (sport in ('running','football')),
 location_label text not null,
 location_lat double precision not null check (location_lat between -90 and 90),
 location_lon double precision not null check (location_lon between -180 and 180),
 context_note text not null,
 enabled boolean not null default true,
 optional boolean not null default true check (optional),
 updated_at timestamptz not null default now()
);
alter table public.garmin_weekly_training_options enable row level security;
revoke all on public.garmin_weekly_training_options from PUBLIC,anon,authenticated;
grant select on public.garmin_weekly_training_options to service_role;
-- Town/district centers for forecasts; not exact field/stadium locations.
insert into public.garmin_weekly_training_options
(code,weekday,start_time,title,sport,location_label,location_lat,location_lon,context_note)
values
('football-mon',1,'19:00','Fußball','football','Friedrichsdorf, Gütersloh',51.93634,8.48762,'Fußball ist oft intensive Stop-and-go-Belastung; berücksichtigen, aber nicht jede Woche einplanen.'),
('orc-track-tue',2,'19:00','ORC Track','running','Oerlinghausen',51.95453,8.66220,'Bahntraining, Intensität nach ausgewählter Trainergruppe. Kein automatisches Intervalltraining.'),
('orc-run-wed',3,'19:00','ORC Run','running','Oerlinghausen',51.95453,8.66220,'Gruppenlauf, in der Regel locker. Tatsächliche Intensität anhand von HF und Erholung beurteilen.'),
('orc-track-sat',6,'09:00','ORC Track','running','Oerlinghausen',51.95453,8.66220,'Bahntraining am Samstag, Intensität erst nach geprüfter Vorlage. Nicht automatisch zweimal hart trainieren.')
on conflict (code) do nothing;

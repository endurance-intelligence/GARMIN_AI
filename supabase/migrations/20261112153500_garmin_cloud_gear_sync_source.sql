-- GARMIN_AI v0.9.45: distinguish a verified cloud gear sync from a manual local import.
-- Never infer successful synchronization from the presence of old gear links.
alter table public.garmin_connect_snapshot
  add column if not exists gear_links_sync_source text not null default 'manual'
  check (gear_links_sync_source in ('manual','cloud'));
comment on column public.garmin_connect_snapshot.gear_links_sync_source is
  'Source of the last verified activity-to-gear association refresh, not image loading. Cloud values are set only by the trusted OIDC worker.';

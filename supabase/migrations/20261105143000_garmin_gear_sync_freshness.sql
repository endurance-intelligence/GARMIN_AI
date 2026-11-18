-- GARMIN_AI v0.7.3.6: source timestamp for complete Garmin gear mappings.
-- Distinguish last checked mapping date from gear status and calendar freshness.
alter table public.garmin_connect_snapshot
  add column if not exists gear_links_checked_at timestamptz;
update public.garmin_connect_snapshot
  set gear_links_checked_at = checked_at
  where activity_gear_scope = 'complete' and gear_links_checked_at is null;

-- GARMIN_AI v0.9.26: older Intervals.icu exports are NOT validated.
alter table public.garmin_training_plan
 add column if not exists intervals_export_version smallint;
-- Mark only GARMIN_AI-owned legacy events requiring human-approved correction.
-- This does not alter any existing Intervals.icu or Garmin event.
update public.garmin_training_plan
set intervals_sync_status='needs_review'
where intervals_event_id is not null and intervals_export_version is null
 and intervals_sync_status='confirmed';

-- Owner-only Coach interruption period and Intervals.icu weight delivery metadata.
-- This schema change was applied via Supabase's migration interface.
alter table public.garmin_coach_context
 add column if not exists illness_kind text,
 add column if not exists illness_expected_end_on date;
alter table public.garmin_coach_context
 drop constraint if exists garmin_coach_context_illness_kind_check;
alter table public.garmin_coach_context
 add constraint garmin_coach_context_illness_kind_check
 check (illness_kind is null or illness_kind in ('illness','pain','fatigue','other'));
alter table public.garmin_coach_context
 drop constraint if exists garmin_coach_context_illness_end_check;
alter table public.garmin_coach_context
 add constraint garmin_coach_context_illness_end_check
 check(illness_expected_end_on is null or illness_started_on is null
  or (illness_expected_end_on>=illness_started_on
   and illness_expected_end_on<=illness_started_on+90));
alter table public.garmin_weight_outbox
 add column if not exists intervals_sync_status text not null default 'not_published',
 add column if not exists intervals_synced_at timestamptz;
alter table public.garmin_weight_outbox
 drop constraint if exists garmin_weight_outbox_intervals_sync_status_check;
alter table public.garmin_weight_outbox
 add constraint garmin_weight_outbox_intervals_sync_status_check
 check(intervals_sync_status in ('not_published','confirmed','needs_review'));
comment on column public.garmin_weight_outbox.intervals_sync_status is
 'Intervals wellness readback only, never evidence of Garmin Connect weight delivery.';

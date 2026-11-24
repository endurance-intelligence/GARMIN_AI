-- Athlete-confirmed Garmin activity ↔ race association.
-- The original race goal, Garmin activities, subjective feedback and workouts
-- stay unchanged. No direct client writes; only the existing owner-only
-- garmin-coach-context Edge Function validates and persists links.
alter table public.garmin_coach_context
 add column if not exists race_activity_links jsonb not null default '[]'::jsonb;

alter table public.garmin_coach_context
 drop constraint if exists garmin_coach_context_race_activity_links_shape;
alter table public.garmin_coach_context
 add constraint garmin_coach_context_race_activity_links_shape
 check (jsonb_typeof(race_activity_links)='array' and
        jsonb_array_length(race_activity_links)<=30);

comment on column public.garmin_coach_context.race_activity_links is
 'Owner-confirmed link of an existing Garmin running activity to a saved race goal. Requires explicit athlete action. Not a medical assessment or official finish; no Garmin/calendar write.';

-- Preserve existing RLS rules and revoked client grants. Service owner endpoint only.

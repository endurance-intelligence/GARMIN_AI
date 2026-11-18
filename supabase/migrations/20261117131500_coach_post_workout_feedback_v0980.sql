-- v0.9.80: owner-only athlete-entered workout feedback, not inferred from Garmin.
alter table public.garmin_coach_context
 add column if not exists post_workout_feedback jsonb not null default '[]'::jsonb;
alter table public.garmin_coach_context
 drop constraint if exists garmin_coach_context_post_workout_feedback_shape;
alter table public.garmin_coach_context
 add constraint garmin_coach_context_post_workout_feedback_shape
 check (jsonb_typeof(post_workout_feedback) = 'array'
        and jsonb_array_length(post_workout_feedback) <= 40);
comment on column public.garmin_coach_context.post_workout_feedback is
 'Athlete-entered RPE, leg fatigue, symptoms and perceived effort for verified past Garmin activities; no automatic scheduling.';
-- Existing owner-only Edge function authentication, service access and RLS remain unchanged.

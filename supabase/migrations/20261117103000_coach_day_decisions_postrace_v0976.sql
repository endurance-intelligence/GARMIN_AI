-- Owner-only coach decisions and self-reported post-race recovery. No automatic calendar blocks.
alter table public.garmin_coach_context
 add column if not exists day_decisions jsonb not null default '[]'::jsonb,
 add column if not exists race_recovery_checks jsonb not null default '[]'::jsonb;
alter table public.garmin_coach_context
 drop constraint if exists garmin_coach_context_day_decisions_shape;
alter table public.garmin_coach_context
 add constraint garmin_coach_context_day_decisions_shape
 check (jsonb_typeof(day_decisions)='array' and jsonb_array_length(day_decisions)<=21);
alter table public.garmin_coach_context
 drop constraint if exists garmin_coach_context_recovery_checks_shape;
alter table public.garmin_coach_context
 add constraint garmin_coach_context_recovery_checks_shape
 check (jsonb_typeof(race_recovery_checks)='array' and jsonb_array_length(race_recovery_checks)<=30);
comment on column public.garmin_coach_context.day_decisions is
 'Owner-selected coach proposal decisions. Not calendar blocks, no Garmin writes.';
comment on column public.garmin_coach_context.race_recovery_checks is
 'Owner-submitted post-race perceived fatigue and muscle soreness. Not a diagnostic or automatic return-to-sport clearance.';
-- RLS and revoked direct access are intentionally unchanged.

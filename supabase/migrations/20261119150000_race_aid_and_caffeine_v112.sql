-- GARMIN_AI v1.1.2: explicitly confirmed aid station fueling + late caffeine controls.
-- Existing race settings and user-owned RLS policies remain unchanged.
ALTER TABLE public.garmin_gel_plan_settings
 ADD COLUMN IF NOT EXISTS aid_confirmed boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS aid_every_laps integer NOT NULL DEFAULT 1
   CHECK (aid_every_laps BETWEEN 1 AND 25),
 ADD COLUMN IF NOT EXISTS aid_drink_mix text NOT NULL DEFAULT 'unknown'
   CHECK (aid_drink_mix IN ('unknown','160','320','custom')),
 ADD COLUMN IF NOT EXISTS aid_drink_ml_per_stop integer NOT NULL DEFAULT 0
   CHECK (aid_drink_ml_per_stop BETWEEN 0 AND 1000),
 ADD COLUMN IF NOT EXISTS aid_custom_carbs_g_per_500 numeric(5,1) NOT NULL DEFAULT 0
   CHECK (aid_custom_carbs_g_per_500 BETWEEN 0 AND 150),
 ADD COLUMN IF NOT EXISTS aid_food_name text NOT NULL DEFAULT ''
   CHECK (char_length(aid_food_name) <= 90),
 ADD COLUMN IF NOT EXISTS aid_food_carbs_g_per_stop numeric(5,1) NOT NULL DEFAULT 0
   CHECK (aid_food_carbs_g_per_stop BETWEEN 0 AND 120),
 ADD COLUMN IF NOT EXISTS caffeine_start_minute integer NOT NULL DEFAULT 360
   CHECK (caffeine_start_minute BETWEEN 0 AND 1440),
 ADD COLUMN IF NOT EXISTS caffeine_max_mg integer NOT NULL DEFAULT 100
   CHECK (caffeine_max_mg BETWEEN 0 AND 400);
-- No aid or caffeine amount is retroactively assumed or added to past plans.

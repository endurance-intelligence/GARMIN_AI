-- v0.9.92: per-event drink carbohydrate assumptions and caffeine opt-in.
CREATE TABLE IF NOT EXISTS public.garmin_gel_plan_settings (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 race_date date NOT NULL,
 race_name text NOT NULL CHECK (char_length(race_name) BETWEEN 1 AND 100),
 drink_carbs_g_per_hour numeric(5,1) NOT NULL DEFAULT 0
  CHECK (drink_carbs_g_per_hour BETWEEN 0 AND 150),
 allow_caffeine boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,race_date,race_name)
);
ALTER TABLE public.garmin_gel_plan_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gel plan read" ON public.garmin_gel_plan_settings
 FOR SELECT TO authenticated USING (user_id=(select auth.uid()));
CREATE POLICY "own gel plan insert" ON public.garmin_gel_plan_settings
 FOR INSERT TO authenticated WITH CHECK (user_id=(select auth.uid()));
CREATE POLICY "own gel plan update" ON public.garmin_gel_plan_settings
 FOR UPDATE TO authenticated USING (user_id=(select auth.uid()))
 WITH CHECK (user_id=(select auth.uid()));
REVOKE ALL ON public.garmin_gel_plan_settings FROM anon;
GRANT SELECT,INSERT,UPDATE ON public.garmin_gel_plan_settings TO authenticated;
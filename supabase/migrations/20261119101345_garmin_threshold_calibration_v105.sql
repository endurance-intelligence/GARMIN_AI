-- GARMIN_AI v1.0.5: optional, user-confirmed physiological HR threshold test.
-- Never derived from device zones, HRmax, age or implied by a training plan.
-- Applied to Supabase as migration 20261119101345.
CREATE TABLE IF NOT EXISTS public.garmin_threshold_calibration (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 lt1_bpm smallint NOT NULL CHECK (lt1_bpm BETWEEN 70 AND 195),
 lt2_bpm smallint NOT NULL CHECK (lt2_bpm BETWEEN 95 AND 220),
 tested_on date NOT NULL CHECK (tested_on >= DATE '1990-01-01'),
 test_type text NOT NULL CHECK (
  test_type IN ('lab_lactate','lab_ventilatory','field_test')),
 note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 240),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT sensible_lt_gap CHECK (lt2_bpm >= lt1_bpm + 8)
);
ALTER TABLE public.garmin_threshold_calibration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.garmin_threshold_calibration FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.garmin_threshold_calibration TO service_role;
COMMENT ON TABLE public.garmin_threshold_calibration IS
 'Private, owner-entered test thresholds. No public Data API access or workout publishing.';

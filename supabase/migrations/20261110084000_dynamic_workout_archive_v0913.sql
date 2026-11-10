-- GARMIN_AI v0.9.13: Immutable, owner-private, reusable trainer sessions.
-- The model never writes Garmin: archive scheduling creates an unapproved event draft.
CREATE TABLE IF NOT EXISTS public.garmin_workout_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id uuid NOT NULL UNIQUE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  coach_name text NOT NULL DEFAULT '' CHECK (length(coach_name)<=100),
  source_label text NOT NULL DEFAULT '' CHECK (length(source_label)<=120),
  source_kind text NOT NULL CHECK(source_kind IN ('trainer_photo','manual','orc_reference')),
  source_image_sha256 text CHECK(source_image_sha256 IS NULL OR source_image_sha256 ~ '^[a-f0-9]{64}$'),
  workout jsonb NOT NULL CHECK(jsonb_typeof(workout)='object'),
  schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.garmin_workout_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.garmin_workout_archive FROM public,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.garmin_workout_archive TO service_role;

ALTER TABLE public.garmin_training_plan
 ADD COLUMN IF NOT EXISTS archive_workout_id uuid REFERENCES public.garmin_workout_archive(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS archive_group text,
 ADD COLUMN IF NOT EXISTS archive_snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS garmin_training_plan_archive_day_group_unique
 ON public.garmin_training_plan (training_date,archive_workout_id,archive_group)
 WHERE archive_workout_id IS NOT NULL AND state <> 'cancelled';

-- Atomically freeze the reviewed original prescription into a calendar draft.
-- The one-way snapshot means future archive additions can never rewrite old sessions.
CREATE OR REPLACE FUNCTION public.garmin_workout_archive_plan(
 p_template_id uuid,p_group text,p_day date,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v public.garmin_workout_archive%ROWTYPE;
 selected jsonb;
 existing public.garmin_training_plan%ROWTYPE;
 today_de date := (clock_timestamp() AT TIME ZONE 'Europe/Berlin')::date;
 title text;
BEGIN
 IF p_template_id IS NULL OR p_request_id IS NULL OR
    p_group IS NULL OR length(p_group) NOT BETWEEN 1 AND 50 OR
    p_day IS NULL OR p_day<today_de OR p_day>today_de+400
 THEN RETURN pg_catalog.jsonb_build_object('saved',false,'code','invalid_request'); END IF;

 SELECT * INTO v FROM public.garmin_workout_archive
 WHERE id=p_template_id;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('saved',false,'code','template_missing'); END IF;
 SELECT x INTO selected FROM pg_catalog.jsonb_array_elements(v.workout->'groups') AS x
 WHERE x->>'name'=p_group LIMIT 1;
 IF selected IS NULL THEN RETURN pg_catalog.jsonb_build_object('saved',false,'code','group_missing'); END IF;

 -- One group of one trainer template on one day, not two competing copies.
 SELECT * INTO existing FROM public.garmin_training_plan
 WHERE training_date=p_day AND archive_workout_id=p_template_id
 AND archive_group=p_group AND state<>'cancelled'
 ORDER BY created_at LIMIT 1;
 IF FOUND THEN
   RETURN pg_catalog.jsonb_build_object('saved',true,'created',false,'id',existing.id,'state',existing.state);
 END IF;

 SELECT * INTO existing FROM public.garmin_training_plan
 WHERE client_request_id=p_request_id;
 IF FOUND THEN
   RETURN pg_catalog.jsonb_build_object('saved',false,'code','request_id_reused');
 END IF;

 title:=left(v.title||' · '||p_group,120);
 INSERT INTO public.garmin_training_plan(
  client_request_id,training_date,title,session_type,sport,
  notes,state,archive_workout_id,archive_group,archive_snapshot
 ) VALUES (
  p_request_id,p_day,title,'event','running',
  left('Originaltrainer: '||coalesce(nullif(v.coach_name,''),'nicht angegeben')||
       '. GARMIN_AI Archiv-Entwurf. Nicht in Garmin übertragen.',500),
  'draft',v.id,p_group,
  pg_catalog.jsonb_build_object(
   'schemaVersion',1,'title',v.title,'coachName',v.coach_name,
   'sourceLabel',v.source_label,'group',selected,
   'warmup',v.workout->'warmup','cooldown',v.workout->'cooldown'
  )
 ) RETURNING * INTO existing;
 RETURN pg_catalog.jsonb_build_object(
   'saved',true,'created',true,'id',existing.id,'state','draft');
EXCEPTION WHEN unique_violation THEN
  RETURN pg_catalog.jsonb_build_object('saved',false,'code','concurrent_duplicate');
END;
$$;
REVOKE ALL ON FUNCTION public.garmin_workout_archive_plan(uuid,text,date,uuid)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_workout_archive_plan(uuid,text,date,uuid)
 TO service_role;

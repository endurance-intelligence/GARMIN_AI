-- GARMIN_AI v0.7.2: original FIT measurements in existing private activity-details row.
-- This is deliberately NOT a second training/coach pipeline or a public data API.
-- No GPS coordinates, bearer tokens, or FIT binaries are persisted.
ALTER TABLE public.garmin_activity_details
  ADD COLUMN IF NOT EXISTS fit_status text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS fit_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_retry_after timestamptz,
  ADD COLUMN IF NOT EXISTS fit_lease_token uuid,
  ADD COLUMN IF NOT EXISTS fit_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS fit_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS fit_record_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_laps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fit_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fit_workout_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fit_sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fit_terrain jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fit_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fit_last_error text;

ALTER TABLE public.garmin_activity_details
  ADD CONSTRAINT garmin_activity_fit_status_check
  CHECK (fit_status IN ('queued','processing','retry','complete','unavailable','paused'));

CREATE INDEX IF NOT EXISTS garmin_details_fit_work_idx
  ON public.garmin_activity_details (fit_status, fit_retry_after, fit_lease_until);

-- Chunk table is a subordinate part of the same private activity data model.
-- Bounded JSONB batches avoid oversized PostgREST requests and giant rewrites.
CREATE TABLE IF NOT EXISTS public.garmin_fit_record_chunks (
  activity_id text NOT NULL REFERENCES public.garmin_activity_details(activity_id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  records jsonb NOT NULL CHECK (jsonb_typeof(records) = 'array'),
  PRIMARY KEY (activity_id, chunk_index)
);
ALTER TABLE public.garmin_fit_record_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.garmin_fit_record_chunks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.garmin_fit_record_chunks TO service_role;

-- One worker owns one activity at a time. Retry recovery handles worker interruption.
CREATE OR REPLACE FUNCTION public.garmin_fit_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_id text; v_token uuid;
BEGIN
  SELECT d.activity_id INTO v_id
    FROM public.garmin_activity_details d
    JOIN public.garmin_activities a ON a.activity_id = d.activity_id
   WHERE d.status IN ('complete','partial')
     AND ((d.fit_status IN ('queued','retry')
            AND (d.fit_retry_after IS NULL OR d.fit_retry_after <= now()))
          OR (d.fit_status = 'processing' AND d.fit_lease_until < now()))
   ORDER BY a.start_time_local DESC NULLS LAST, d.activity_id DESC
   FOR UPDATE OF d SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- A restarted worker must never reuse half-written chunks.
  DELETE FROM public.garmin_fit_record_chunks WHERE activity_id = v_id;
  UPDATE public.garmin_activity_details
     SET fit_status = 'processing', fit_attempts = fit_attempts + 1,
         fit_lease_token = gen_random_uuid(), fit_lease_until = now() + interval '3 minutes',
         updated_at = now()
   WHERE activity_id = v_id
   RETURNING fit_lease_token INTO v_token;
  RETURN jsonb_build_object('activity_id', v_id, 'lease_token', v_token);
END $fn$;
REVOKE ALL ON FUNCTION public.garmin_fit_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_fit_claim() TO service_role;

CREATE OR REPLACE FUNCTION public.garmin_fit_append(
  p_activity_id text, p_lease_token uuid, p_chunk_index integer, p_records jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF p_chunk_index < 0 OR p_chunk_index > 100 OR p_records IS NULL OR
     jsonb_typeof(p_records) <> 'array' OR
     jsonb_array_length(p_records) < 1 OR jsonb_array_length(p_records) > 2000 THEN
    RAISE EXCEPTION 'Invalid FIT record chunk';
  END IF;
  PERFORM 1 FROM public.garmin_activity_details
    WHERE activity_id = p_activity_id AND fit_status = 'processing'
      AND fit_lease_token = p_lease_token AND fit_lease_until > now()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale FIT chunk'; END IF;
  INSERT INTO public.garmin_fit_record_chunks(activity_id, chunk_index, records)
  VALUES (p_activity_id, p_chunk_index, p_records)
  ON CONFLICT (activity_id, chunk_index)
  DO UPDATE SET records = excluded.records;
END $fn$;
REVOKE ALL ON FUNCTION public.garmin_fit_append(text,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_fit_append(text,uuid,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.garmin_fit_store(
  p_activity_id text, p_lease_token uuid, p_payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_count integer; v_declared integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR
     jsonb_typeof(p_payload->'laps') <> 'array' OR
     jsonb_typeof(p_payload->'events') <> 'array' OR
     jsonb_typeof(p_payload->'workoutSteps') <> 'array' OR
     jsonb_typeof(p_payload->'sessions') <> 'array' OR
     jsonb_typeof(p_payload->'terrain') <> 'array' OR
     jsonb_typeof(p_payload->'quality') <> 'object' THEN
    RAISE EXCEPTION 'Invalid FIT payload';
  END IF;
  v_declared := (p_payload->>'recordCount')::integer;
  SELECT coalesce(sum(jsonb_array_length(c.records)),0)::integer INTO v_count
    FROM public.garmin_fit_record_chunks c WHERE c.activity_id = p_activity_id;
  IF v_count < 2 OR v_count > 200000 OR v_declared IS DISTINCT FROM v_count OR
     jsonb_array_length(p_payload->'laps') > 2000 OR
     jsonb_array_length(p_payload->'events') > 5000 OR
     jsonb_array_length(p_payload->'workoutSteps') > 2000 OR
     jsonb_array_length(p_payload->'sessions') > 16 OR
     jsonb_array_length(p_payload->'terrain') > 10000 THEN
    RAISE EXCEPTION 'FIT payload outside validated limits';
  END IF;
  UPDATE public.garmin_activity_details
     SET fit_status = 'complete',
         fit_record_count = v_count, fit_laps = p_payload->'laps',
         fit_events = p_payload->'events', fit_workout_steps = p_payload->'workoutSteps',
         fit_sessions = p_payload->'sessions', fit_terrain = p_payload->'terrain',
         fit_quality = p_payload->'quality', fit_fetched_at = now(),
         fit_last_error = null, fit_retry_after = null,
         fit_lease_token = null, fit_lease_until = null, updated_at = now()
   WHERE activity_id = p_activity_id AND fit_status = 'processing'
     AND fit_lease_token = p_lease_token AND fit_lease_until > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale FIT claim'; END IF;
  RETURN jsonb_build_object('stored',true,'record_count',v_count);
END $fn$;
REVOKE ALL ON FUNCTION public.garmin_fit_store(text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_fit_store(text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.garmin_fit_fail(
  p_activity_id text, p_lease_token uuid, p_reason text,
  p_permanent boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  UPDATE public.garmin_activity_details
     SET fit_status = CASE WHEN p_permanent THEN 'unavailable'
                           WHEN fit_attempts >= 5 THEN 'paused' ELSE 'retry' END,
         fit_retry_after = CASE WHEN p_permanent OR fit_attempts >= 5 THEN NULL
                  ELSE now() + interval '5 minutes' * power(2.0,least(fit_attempts,4)) END,
         fit_last_error = left(coalesce(p_reason,'fit-error'),120),
         fit_lease_token = null, fit_lease_until = null, updated_at = now()
   WHERE activity_id = p_activity_id AND fit_status = 'processing'
     AND fit_lease_token = p_lease_token;
END $fn$;
REVOKE ALL ON FUNCTION public.garmin_fit_fail(text,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_fit_fail(text,uuid,text,boolean) TO service_role;

-- Keep the EXISTING details scheduler responsible for FIT enrichment as well.
-- Without this, the five-minute cron returns early after the legacy details
-- queue is empty even while FIT jobs are queued or ready for retry.
CREATE OR REPLACE FUNCTION garmin_private.dispatch_garmin_details()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $body$
DECLARE
  v_token text;
  v_request_id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.garmin_activities a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.garmin_activity_details d
      WHERE d.activity_id = a.activity_id
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.garmin_activity_details d
    WHERE (d.status IN ('queued','retry')
             AND (d.retry_after IS NULL OR d.retry_after <= now()))
       OR (d.status = 'processing' AND d.lease_until < now())
  ) AND NOT EXISTS (
    SELECT 1 FROM public.garmin_activity_details d
    WHERE d.status IN ('complete','partial')
      AND (
        (d.fit_status IN ('queued','retry')
           AND (d.fit_retry_after IS NULL OR d.fit_retry_after <= now()))
        OR (d.fit_status = 'processing' AND d.fit_lease_until < now())
      )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'garmin_ai_cron_token';

  IF v_token IS NULL OR length(v_token) <> 64 THEN
    RAISE EXCEPTION 'GARMIN_AI scheduler token unavailable';
  END IF;

  SELECT net.http_post(
    url := 'https://eurgupsebxypjqvyizci.supabase.co/functions/v1/backfill-garmin-details',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-garmin-sync-secret', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) INTO v_request_id;

  RETURN v_request_id;
END
$body$;
REVOKE ALL ON FUNCTION garmin_private.dispatch_garmin_details() FROM PUBLIC, anon, authenticated;

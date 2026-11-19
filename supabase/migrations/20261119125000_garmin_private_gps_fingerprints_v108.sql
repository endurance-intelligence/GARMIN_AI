-- GARMIN_AI v1.0.8: compact private GPS route evidence, separate from FIT record storage.
-- Never expose raw FIT samples/coordinates through the browser Data API.
CREATE TABLE IF NOT EXISTS public.garmin_route_tracks (
  activity_id text PRIMARY KEY REFERENCES public.garmin_activities(activity_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','retry','complete','unavailable','paused')),
  fingerprint jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 6),
  retry_after timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_track_evidence CHECK (
    (status='complete' AND fingerprint IS NOT NULL
       AND jsonb_typeof(fingerprint)='object'
       AND fingerprint->>'version'='1'
       AND jsonb_typeof(fingerprint->'points')='array'
       AND jsonb_array_length(fingerprint->'points')=51)
    OR (status<>'complete' AND fingerprint IS NULL)
  )
);
ALTER TABLE public.garmin_route_tracks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.garmin_route_tracks FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.garmin_route_tracks TO service_role;
CREATE INDEX IF NOT EXISTS garmin_route_tracks_work_idx
  ON public.garmin_route_tracks(status,retry_after,lease_until);

-- Queue historical runs only: original FIT may be downloaded separately;
-- existing complete FIT chunks are NEVER erased just for route enrichment.
INSERT INTO public.garmin_route_tracks(activity_id)
SELECT a.activity_id
FROM public.garmin_activities a
JOIN public.garmin_activity_details d ON d.activity_id=a.activity_id
WHERE a.sport_type='running' AND a.distance_m BETWEEN 3000 AND 30000
  AND left(a.start_time_local,10) >= to_char(now()-interval '730 days','YYYY-MM-DD')
  AND d.fit_status='complete'
ON CONFLICT (activity_id) DO NOTHING;

-- Future running workouts enter the same bounded queue without modifying
-- pre-existing Garmin activity / FIT data.
CREATE OR REPLACE FUNCTION garmin_private.enqueue_garmin_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NEW.sport_type='running' AND NEW.distance_m BETWEEN 3000 AND 30000
    AND left(coalesce(NEW.start_time_local,''),10) >=
        to_char(now()-interval '730 days','YYYY-MM-DD') THEN
   INSERT INTO public.garmin_route_tracks(activity_id)
   VALUES(NEW.activity_id) ON CONFLICT(activity_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION garmin_private.enqueue_garmin_route() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS garmin_enqueue_gps_route ON public.garmin_activities;
CREATE TRIGGER garmin_enqueue_gps_route
AFTER INSERT OR UPDATE OF sport_type,distance_m ON public.garmin_activities
FOR EACH ROW EXECUTE FUNCTION garmin_private.enqueue_garmin_route();

CREATE OR REPLACE FUNCTION public.garmin_route_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id text; v_token uuid;
BEGIN
 SELECT r.activity_id INTO v_id
 FROM public.garmin_route_tracks r
 JOIN public.garmin_activities a USING (activity_id)
 JOIN public.garmin_activity_details d USING (activity_id)
 WHERE d.fit_status='complete' AND
  ((r.status IN ('queued','retry') AND
     (r.retry_after IS NULL OR r.retry_after<=now()))
   OR (r.status='processing' AND r.lease_until<now()))
 ORDER BY a.start_time_local DESC NULLS LAST
 FOR UPDATE OF r SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.garmin_route_tracks
  SET status='processing', attempts=attempts+1,
      lease_token=gen_random_uuid(), lease_until=now()+interval '3 minutes',
      retry_after=null,updated_at=now()
 WHERE activity_id=v_id RETURNING lease_token INTO v_token;
 RETURN jsonb_build_object('activity_id',v_id,'lease_token',v_token);
END $fn$;
REVOKE ALL ON FUNCTION public.garmin_route_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_route_claim() TO service_role;

CREATE OR REPLACE FUNCTION public.garmin_route_store(
 p_activity_id text,p_lease_token uuid,p_fingerprint jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF p_fingerprint IS NOT NULL AND (
    jsonb_typeof(p_fingerprint)<>'object' OR
    p_fingerprint->>'version'<>'1' OR
    jsonb_typeof(p_fingerprint->'points')<>'array' OR
    jsonb_array_length(p_fingerprint->'points')<>51) THEN
   RAISE EXCEPTION 'Invalid route fingerprint';
 END IF;
 UPDATE public.garmin_route_tracks SET
   status=CASE WHEN p_fingerprint IS NULL THEN 'unavailable' ELSE 'complete' END,
   fingerprint=p_fingerprint, checked_at=now(),updated_at=now(),
   lease_token=null,lease_until=null,retry_after=null,last_error=null
 WHERE activity_id=p_activity_id AND status='processing'
   AND lease_token=p_lease_token AND lease_until>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale route claim'; END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.garmin_route_store(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_route_store(text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.garmin_route_fail(
 p_activity_id text,p_lease_token uuid,p_reason text,p_permanent boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_limited boolean := p_reason='fit-download HTTP 429';
BEGIN
 UPDATE public.garmin_route_tracks SET
   status=CASE WHEN p_permanent THEN 'unavailable'
          WHEN attempts>=5 THEN 'paused' ELSE 'retry' END,
   fingerprint=null,
   retry_after=CASE WHEN p_permanent OR attempts>=5 THEN null
       WHEN v_limited THEN now()+interval '2 hours'
       ELSE now()+interval '10 minutes'*power(2.0,least(attempts,4)) END,
   last_error=left(coalesce(p_reason,'route-error'),100),
   lease_token=null,lease_until=null,updated_at=now()
 WHERE activity_id=p_activity_id AND status='processing'
   AND lease_token=p_lease_token;
 -- A Garmin 429 stops the entire route importer for two hours, not
 -- merely the affected activity, to prevent hammering the API.
 IF v_limited THEN
   UPDATE public.garmin_route_tracks
    SET retry_after=greatest(coalesce(retry_after,now()),now()+interval '2 hours')
   WHERE status IN ('queued','retry');
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.garmin_route_fail(text,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_route_fail(text,uuid,text,boolean) TO service_role;

-- Existing 5-minute Garmin detail scheduler remains the SINGLE job runner.
-- It dispatches when GPS evidence is pending, without a parallel scheduler.
CREATE OR REPLACE FUNCTION garmin_private.dispatch_garmin_details()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE v_token text; v_request_id bigint;
BEGIN
 IF NOT EXISTS (
    SELECT 1 FROM public.garmin_activities a WHERE NOT EXISTS (
      SELECT 1 FROM public.garmin_activity_details d WHERE d.activity_id=a.activity_id
    )
 ) AND NOT EXISTS (
    SELECT 1 FROM public.garmin_activity_details d WHERE
      (d.status IN ('queued','retry') AND
       (d.retry_after IS NULL OR d.retry_after<=now()))
      OR (d.status='processing' AND d.lease_until<now())
 ) AND NOT EXISTS (
    SELECT 1 FROM public.garmin_activity_details d
    WHERE d.status IN ('complete','partial') AND (
      (d.fit_status IN ('queued','retry') AND
        (d.fit_retry_after IS NULL OR d.fit_retry_after<=now()))
      OR (d.fit_status='processing' AND d.fit_lease_until<now())
    )
 ) AND NOT EXISTS (
    SELECT 1 FROM public.garmin_route_tracks r
    JOIN public.garmin_activity_details d USING (activity_id)
    WHERE d.fit_status='complete' AND (
      (r.status IN ('queued','retry') AND
        (r.retry_after IS NULL OR r.retry_after<=now()))
      OR (r.status='processing' AND r.lease_until<now())
    )
 ) THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO v_token
 FROM vault.decrypted_secrets WHERE name='garmin_ai_cron_token';
 IF v_token IS NULL OR length(v_token)<>64 THEN
   RAISE EXCEPTION 'GARMIN_AI scheduler token unavailable';
 END IF;
 SELECT net.http_post(
   url:='https://eurgupsebxypjqvyizci.supabase.co/functions/v1/backfill-garmin-details',
   headers:=jsonb_build_object('Content-Type','application/json',
                               'x-garmin-sync-secret',v_token),
   body:='{}'::jsonb,timeout_milliseconds:=90000
 ) INTO v_request_id;
 RETURN v_request_id;
END $body$;
REVOKE ALL ON FUNCTION garmin_private.dispatch_garmin_details() FROM PUBLIC,anon,authenticated;

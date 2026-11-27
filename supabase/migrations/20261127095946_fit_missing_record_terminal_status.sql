-- Keep the existing service-role-only worker contract. A valid FIT which
-- repeatedly contains no record messages is missing detail evidence, not a live backlog.
CREATE OR REPLACE FUNCTION public.garmin_fit_fail(p_activity_id text, p_lease_token uuid, p_reason text, p_permanent boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.garmin_activity_details
     SET fit_status = CASE WHEN p_permanent OR (p_reason = 'fit-records-unavailable' AND fit_attempts >= 5) THEN 'unavailable'
                           WHEN fit_attempts >= 5 THEN 'paused' ELSE 'retry' END,
         fit_retry_after = CASE WHEN p_permanent OR fit_attempts >= 5 THEN NULL
                  ELSE now() + interval '5 minutes' * power(2.0,least(fit_attempts,4)) END,
         fit_last_error = left(coalesce(p_reason,'fit-error'),120),
         fit_lease_token = null, fit_lease_until = null, updated_at = now()
   WHERE activity_id = p_activity_id AND fit_status = 'processing'
     AND fit_lease_token = p_lease_token;
END $function$;
REVOKE EXECUTE ON FUNCTION public.garmin_fit_fail(text,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.garmin_fit_fail(text,uuid,text,boolean) TO service_role;
-- Handle a previously exhausted one-time retry if it completed before this migration.
UPDATE public.garmin_activity_details d
SET fit_status='unavailable',fit_retry_after=NULL,updated_at=now()
WHERE fit_status='paused' AND fit_last_error='fit-records-unavailable' AND fit_attempts>=6
AND coalesce(fit_record_count,0)=0 AND fit_lease_token IS NULL AND fit_lease_until IS NULL
AND NOT EXISTS (SELECT 1 FROM public.garmin_fit_record_chunks c WHERE c.activity_id=d.activity_id);

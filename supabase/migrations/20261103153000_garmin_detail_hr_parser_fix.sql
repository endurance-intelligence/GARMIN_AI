-- v0.5.2.1: Safe diagnostic retry after directHeartRate descriptor parser fix.
-- Keep the details scheduler stopped until successful HR samples are confirmed.
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'garmin-ai-details-every-5min') THEN
    PERFORM cron.unschedule('garmin-ai-details-every-5min');
  END IF;
END
$body$;

-- Requeue only two most-recent normal runs that had chart rows but no HR
-- detected by the old parser. Do not overwrite their previous raw values;
-- garmin_detail_store updates the normalized payload after the fresh fetch.
WITH chosen AS (
  SELECT d.activity_id
  FROM public.garmin_activity_details AS d
  JOIN public.garmin_activities AS a USING (activity_id)
  WHERE d.status = 'partial'
    AND d.chart_available = true
    AND d.hr_sample_count = 0
    AND a.sport_type IN ('running','track_running','treadmill_running','ultra_run')
  ORDER BY a.start_time_local DESC NULLS LAST
  LIMIT 2
)
UPDATE public.garmin_activity_details AS d
SET status = 'queued',
    attempts = 0,
    retry_after = null,
    lease_token = null,
    lease_until = null,
    updated_at = now()
WHERE d.activity_id IN (SELECT activity_id FROM chosen);

-- Queue a single bounded invocation (up to two activities); pg_net sends
-- the request after the transaction commits.
SELECT garmin_private.dispatch_garmin_details();

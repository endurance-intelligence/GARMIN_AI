# GARMIN_AI v0.9.5 — Garmin workout calendar delivery

## Implemented
- `public.garmin_training_plan` stores owner-created training drafts. Approval is **explicit** via the owner-only Edge API.
- Service-only RPCs: `garmin_calendar_next_pending`, `garmin_calendar_claim`, `garmin_calendar_confirm_existing`, `garmin_calendar_finish`.
- Hardlocked OIDC worker `garmin-calendar-worker`. Only the exact signed main-branch **workflow_dispatch** job can access it.
- A single approved existing workout template is checked against Garmin calendar before any write.
- The worker performs at most **one** Garmin `scheduleWorkout` per invocation. After the write it checks the Garmin calendar again; uncertainty becomes `needs_review`, never an automatic retry.
- The shared Garmin OAuth-429 circuit breaker prevents cloud refresh bursts.
- No Garmin API credentials or Supabase service-role key are exposed to GitHub or browsers.
- The calendar delivery workflow is deliberately **manual-only**, with no cron.
- `LIVE_WRITES_RELEASED=false` in the Edge worker; GitHub and Supabase opt-in flags are additional independent gates. In this release **no calendar write is possible**.
- Validated source commit: `c95d772780d882ecf523ea65646c58162eb280d5`.

## Supported vs. pending
- Supports *existing Garmin workout template IDs* when future writes are explicitly released.
- Creating new structured workout templates from Garmin_AI coach specifications: not implemented.
- Generic Garmin calendar notes/events: not implemented; current unofficial SDK scheduling supports existing workouts.
- The Garmin native calendar subscription URL (published via Garmin Connect Web) can be subscribed to in Apple Calendar, Google Calendar and Outlook. This is a rolling 30-day window. The user must publish and subscribe to the URL once.

## Activation prerequisites
1. Successfully verify Garmin OAuth refresh and calendar reads after the current rate limit.
2. Dry-run the manual OIDC workflow and inspect logs.
3. Test a single **user-approved** calendar write, manually reconcile a readback and only then consider a daily schedule.
4. Never retry a `sending` or `needs_review` row automatically.

# GARMIN_AI v0.9.4 — Training calendar and Garmin sync

## Confirmed and deployed
- Private table `public.garmin_training_plan` with deny-by-default RLS.
- Owner-only Edge API `garmin-training-plan` (GET/POST).
- `create` creates a draft. `approve` explicitly queues it; `cancel` cancels only a local draft or pending item.
- Idempotent `clientRequestId` and optimistic `revision`.
- `event`: arbitrary Garmin calendar item; `workout`: references an existing numeric Garmin workout template ID.
- Every Edge response explicitly states `garminUpdated:false`. There is NO remote Garmin writer yet.
- The read-only automatic Garmin gear/calendar sync is provided by v0.9.3.
- All OAuth tokens remain in Supabase Vault; none are accessible to the browser.
- Full implementation source pinned to commit `f32d010bbe443c7d4bde9bde365f2ca36348301b`.

## Next integration
- Implement a separate GitHub OIDC calendar delivery worker after Garmin OAuth is reliably healthy.
- For each approved pending item, read Garmin calendar before attempting any remote creation/scheduling.
- Post-write verification and reconciliation; never auto-retry uncertain writes.
- Connect the owner API to the iPhone/iPad training planner after backend validation.

## Garmin to personal calendar
Use Garmin Connect's native **Publish Calendar** option and subscribe to the published URL
in Apple, Google or Outlook Calendar. Garmin's published calendar is a rolling 30-day window.
There is no custom ICS service, no second calendar to reconcile.

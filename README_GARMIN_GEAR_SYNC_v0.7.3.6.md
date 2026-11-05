# GARMIN_AI v0.7.3.6 — Equipment polish + authoritative shoe assignment sync

## Why this release

GARMIN_AI already shows the five active shoes, real known distances, private photos and 411 historical gear/activity links. A user later changed shoes on several Garmin activities. Existing `Garmin-Status aktualisieren` only updates the **gear status/type**, not activity-to-gear links; existing link counts/distances therefore remain stale until a new Garmin read.

## Equipment polish

- Active shoe cards are ordered by **known distance descending**.
- Kilometer are visually prominent; redundant "Shoes" labels are removed only from visual shoe cards.
- Photo scaling is slightly more consistent. Other active gear and archived gear remain compact.
- Existing photos are preserved: image storage is separate, keyed by Garmin gear UUID.

## Gear synchronization (safe manual trigger, automatic local processing)

1. Equipment has a new **Schuhzuordnungen synchronisieren** button. It starts a read-only local Garmin job using the saved Garmin Connect session. Garmin passwords/tokens are never handed to the browser or Supabase.
2. The local worker calls `getGearActivities(uuid,1000)` once for each gear, including retired gear. This is necessary to detect both **new** and **removed/moved** links after the user edits older activities.
3. After each gear is read, a sanitized checkpoint is saved privately to `%LOCALAPPDATA%\GARMIN_AI\garmin-gear-sync-progress.json`. If Garmin times out, the job fails **without modifying the existing Supabase snapshot**. Clicking again resumes the remaining items within a 24-hour checkpoint.
4. If all known gear completes successfully, the worker writes the verified `garmin-connect-gear-history.json` atomically, replaces the checkpoint, and returns a summary.
5. The browser receives only the verified activity ID + gear UUID pairs, compares them to the **stored** 411 baseline, displays new/removed counts, and asks for explicit approval.
6. The owner-authenticated Edge Function accepts `mode:'gear-links'`, validates **the entire current gear catalog**, refuses older scans, and replaces the mappings atomically with optimistic concurrency protection. This is **replacement**, not append: when a run moves from shoe A to B, A loses the activity and B gains it.
7. Shoe kilometres are recalculated from the canonical `garmin_activities` table. Existing photos, status, calendar and FIT details remain unchanged. Newly edited links to missing activities are visibly counted as missing, not invented.

## Deployment

Branch: `feature/gear-polish-sync-v0.7.3.6`, based on `feature/gear-visual-cards-v0.7.3.5`.

- Run tests: `node --test tests/garmin-gear-sync.test.mjs tests/garmin-gear-history.test.mjs tests/garmin-gear-image.test.mjs`.
- Run build: `npm run build`.
- Apply only `20261105143000_garmin_gear_sync_freshness.sql` after successful migration dry-run, validating project reference `eurgupsebxypjqvyizci`.
- Deploy only `garmin-connect-snapshot` Edge Function (existing `garmin-gear-image` unchanged).
- Restart Vite on loopback `127.0.0.1:5173`; click **Schuhzuordnungen synchronisieren**.
- Review the before/after count and approve. Verify active shoe kilometre changes and baseline link count.
- If Garmin returns a timeout: do **not** reverify all gear. Click sync again; completed gear are reused from the checkpoint for at most 24 hours.

## Remaining boundaries

This version enables **one-click refresh while GARMIN_AI runs locally**, not an unattended scheduled cloud sync. It uses the last verified catalog of Garmin gear IDs; if new gear has been added/deleted in Garmin, refresh the Garmin catalog first. Garmin Connect unofficial endpoints can rate-limit and change. A future integration milestone will unify catalog/status/calendar refresh and recurring sync with sensible boundaries before we declare all data sources fully automated.

The sequence of separate reads is not an atomic snapshot within Garmin. Avoid editing Garmin gear during a sync in progress, and check one recently changed activity in Garmin to confirm expected reconciliation. No Garmin write endpoints are used.

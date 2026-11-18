# GARMIN_AI v0.9.13 – dynamic trainer workout archive

## Product flow
1. Open **Kalender → Trainingsbibliothek** on ANY date (no hard-coded Tuesday/Saturday).
2. Option A: upload a trainer JPG/PNG/WebP (max 2.7 MB) for AI transcription.
   - The photo is sent once to OpenAI's Responses API, **only after explicit selection**.
   - Requires private Supabase Edge secret `OPENAI_API_KEY` with optional `OPENAI_WORKOUT_PARSE_MODEL`.
   - With no key, the UI says photo transcription is unavailable; it does not fake results.
   - OpenAI model may misread color codes, distances or intervals. **Always inspect and edit** every group.
   - The original image is not archived. Only SHA-256, trainer metadata and validated steps are saved.
3. Option B: create a workout manually with arbitrary groups, intervals, jog recoveries,
   distances, running paces and optional time-based efforts.
4. Option C: **explicitly** import the previous ORC `Schwelle im Wechsel` poster
   with Wolf/Fuchs/Tiger/Bären/Capybara as the initial library example.
   This is a historical sample, NOT a recurring weekly prescription.
5. Press "Geprüfte Vorlage archivieren" to persist an immutable reviewed version.
6. Select any saved group's prescription and press "Für [Datum] vormerken".
   A full immutable snapshot of the group's precise steps is written to the
   private `garmin_training_plan` table in a local `draft` state.
   **No Garmin API write**, no automatic coach rescheduling.
7. The existing Calendar API lists this separate draft. The archive always keeps
   its original prescribing trainer and can be reused on any later day.

## Security
- `garmin_workout_archive` denies `anon` and `authenticated` direct SQL access;
  table RLS is enabled and only `service_role` can select/insert.
- `garmin-workout-archive` Edge API verifies the logged-in confirmed owner's
  email via Supabase Auth `getUser`; restrictive trusted Origin allowlist.
- All photo recognition output is **untrusted**; strict schema/range validators run
  on both model output and owner-approved saving.
- Archive records are immutable. Corrections produce another reviewed record;
  calendar drafts preserve a copy of the original trainer steps.
- Owner-only atomic PostgreSQL RPC schedules archive groups as `event` drafts;
  they cannot be picked up by the locked Garmin workout calendar writer.
- Neither Garmin OAuth tokens nor service-role keys are embedded in the mobile app.

## Deliberate follow-ons
- Activate and verify optional photo parsing by configuring the private
  `OPENAI_API_KEY` secret in Supabase; no personal Garmin key is needed.
- The Coach can read the workout archive as a selection catalog, but **no
  automatic Coach recommendations are asserted** until training context and
  explicit approval are implemented.
- A separately reviewed Garmin workflow library uploader / calendar scheduler
  will consume validated archive snapshots after OAuth/read-back approval.
- Optionally store the original poster in an access-controlled private bucket
  after a privacy review; v0.9.13 intentionally avoids retaining raw photos.
- Improve archive navigation with search, tags and workout difficulty metadata
  grounded in real session data, not fabricated scores.

## Verification
- Node unit tests including `mobile-dynamic-workout-archive.test.mjs`.
- Production Vite/iPhone/iPad build and public-key safety check.
- Supabase verified RLS true, anon/auth direct access false, invalid RPC rejected.
- Edge unauthenticated GET returns HTTP 401.

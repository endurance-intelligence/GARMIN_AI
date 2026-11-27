# Package 4A — E2E verification

## Production read-only audit, 2026-11-27

- Garmin archive: 621 activities; 613 complete FIT imports and 8 paused FIT imports. All 621 activity-detail records have partial overall status; FIT completeness is a distinct status.
- Health: 40 days, latest 2026-11-27. Garmin activity and health import runs successful in the last two days.
- Intervals: connection present; stored confirmed publication links and revision match verified. No new training created or sent.
- Five Garmin cron jobs active; one partial week archived (2026-11-23), so historical learning does not yet have a complete week.
- 33 Garmin public tables have RLS enabled. Advisor INFO for closed tables with no client policies is expected for owner-only Edge Function access; leaked-password protection advisor warning remains open (magic-link login in app).
- Production browser bundle tested with isolated fixtures. No owner credentials, live API writes, or test training events are used. Actual authenticated external workflow and real-device visual acceptance remain separate checks.

## Automated release gate
The production workflow builds the app and uses isolated Playwright/Chromium tooling to test sign-out, denied owner access, responsive navigation and session selection before publishing. External requests are intercepted, not sent. This is browser integration coverage, not evidence of a successful real Garmin or Intervals write.

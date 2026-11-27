# Package 4A — E2E verification

## Production audit procedure

Use read-only aggregate checks for Garmin sync freshness, FIT completeness, health coverage, stored Intervals publication references and revisions, active cron jobs, archived week coverage and RLS. Keep individual athlete data and the audit's live counts out of the public source tree. A partial archive is not a complete historical plan. A stored Intervals confirmation is not a new external delivery test.

## Automated release gate

The production workflow builds the app and uses isolated Playwright/Chromium tooling to test sign-out, denied owner access, responsive navigation and session selection before publishing. All external requests are intercepted, not sent. No owner credentials, live API writes or test training events are used. Actual authenticated external workflows and real-device visual acceptance remain separate checks.

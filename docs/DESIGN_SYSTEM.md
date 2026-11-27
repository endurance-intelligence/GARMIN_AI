# GARMIN_AI design system (3C)

Shared tokens live in `src/styles/design-system.css`, loaded after feature CSS by App. Feature CSS owns layout and specialized safety/quality visuals. This pass covers Coach, Calendar, Analysis, Goals and Race Prep forecast surfaces.

- Dark neutral surfaces, distinct inset evidence, 18 px outer and 12 px inset radius, consistent tabular numbers.
- Mint: actual/verified or explicit primary action; blue: saved/approved plan; lavender: draft and violet/dashed: Coach proposal; outlined muted teal: optional group offer. Text labels and border patterns remain mandatory, never color alone. Draft is not approved; approved is not remotely confirmed.
- Amber: caution or pending, rose: warning. Training-quality, race-day and decline states retain their own explicit text and styling.
- Primary actions share the mint treatment; secondary, publish, destructive and non-write actions remain distinct.
- 44 px minimum for the listed main action controls; visible keyboard focus; respect reduced-motion preference for page animation.
- No change to readiness, evidence, status mapping, approvals, persistence, external writes or navigation. Actual browser visual verification on an authenticated session remains part of the end-to-end pass.

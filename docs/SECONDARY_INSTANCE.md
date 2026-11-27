# Separate single-owner instances
The primary Pages build remains unchanged. The optional secondary build is generated from the same tested source commit under `/GARMIN_AI/athlete/`. The secondary build has its own Supabase URL and modern publishable key; the primary project is explicitly rejected as a secondary target. Neither build contains a secret or service-role key.

## Backend release
Keep one database/owner/credential set per instance. No athlete records, accounts, secrets, logs or personal defaults are copied into another project. The secondary project remains offline for scheduled imports until the owner has authorized independent Garmin credentials. Never redirect an existing primary worker to the secondary project.

The checked-in `scripts/build-instance-edge-bundle.mjs` prepares owner-only Edge bundles from the canonical source tree. Usage: `node scripts/build-instance-edge-bundle.mjs ENDPOINT SECONDARY_PROJECT_URL OUTPUT_JSON`. Deploy only to the explicit matching project, with its existing internal owner verification retained. The script only prepares source and never deploys or obtains credentials. Validate all source dependencies, deploy versions and unauthorized access before enabling a release. Worker/OIDC/AI routes require separate review; do not copy the primary worker authorization or AI API keys.

## Secondary browser release
Use repository Actions variables, not code or committed .env files:
- GARMIN_SECONDARY_SUPABASE_URL
- GARMIN_SECONDARY_SUPABASE_PUBLISHABLE_KEY
- GARMIN_SECONDARY_ENABLED=true (only after backend access checks and owner setup)

The primary build uses its existing URL/key. The secondary release is opt-in. CI always tests the secondary source with a synthetic project and isolated request fixtures, including independent authentication storage and a scoped application cache; when enabled, the real secondary build additionally passes live anonymous/invalid-session denial checks. One Pages artifact contains both builds.

The application cache in the secondary build uses a project-ref-specific prefix. Supabase's SDK uses its own per-project auth storage. These namespaces prevent accidental cache reuse; they are not separate browser origins or a security sandbox. Use separate browser profiles/devices when two people share a computer.

Before activation configure the secondary project's own confirmed owner and Magic Link redirect, personal training rhythm/equipment, beginner-appropriate goals and independent data connections. Do not migrate primary browser preferences, group training choices, athlete history, or training plans. No real workout is sent without the new owner's explicit approval.

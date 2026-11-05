# GARMIN_AI v0.7.3.4 — Garmin Gear Status (active / retired)

The existing `getGear` read on the **user's own Garmin Connect session** returns `gearStatusName` (`active` or `retired`) and `gearTypeName` (for example `Shoes`). Previous v0.7.3.3 normalization discarded both values, so all 18 gear entries were shown identically.

Changes:
- Only allowlist `active`, `retired`, `unknown`. Unknown values must **not** be promoted to active.
- Preserve `gearTypeName` and `gearStatusName` in the sanitized local report and existing private Supabase snapshot. No schema migration.
- Equipment groups: **Aktive Laufschuhe**, **Weitere aktive Ausrüstung**, a collapsed **Aussortiert / Archiv**, and a collapsed **Status nicht erkannt** group. Archived items remain in the database and existing 411 historical activity mappings are left intact, so activity history does not lose its original shoe association.
- No changes to workout export, Garmin credential handling, FIT import, or running coach. Nothing is deleted from Garmin.

## Verify / deploy

1. In PowerShell, switch from `feature/garmin-gear-history-v0.7.3.3` to `feature/garmin-gear-status-v0.7.3.4` after checking for a clean Git workspace.
2. Run `node --test tests/garmin-connect-model.test.mjs tests/garmin-connect-snapshot.test.mjs tests/garmin-gear-history.test.mjs` and `npm.cmd run build`.
3. Re-run `node scripts/garmin-connect-verify.mjs` to refresh gear statuses (read-only). It prints counts for **active**, **retired**, **unknown**.
4. Re-run `node scripts/garmin-connect-gear-history.mjs` because the verification timestamp changed; verify **18 gear checked** and check the new link count. No data gets erased if Garmin fails here.
5. Deploy the updated `garmin-connect-snapshot` Edge Function to the linked Supabase project. No database migration.
6. Restart Vite and in Equipment approve **Lokalen Garmin-Bericht übernehmen**. Only the sanitized gear/calendar/history data crosses the app's existing owner-authenticated Supabase boundary.

**Acceptance:** Non-retired shoes with status active appear first; retired shoes remain accessible only within the archive; unknown status is visibly segregated and not falsely classified as active. Historical link and distance totals remain available for archived items. Use screenshots of only the Equipment UI or summary counts, never token files.

Do not upload `%LOCALAPPDATA%\GARMIN_AI\garmin-connect-tokens` or the local Garmin report files.

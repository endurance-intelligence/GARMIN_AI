# GARMIN_AI v0.7.3.5 — Gear Visual Cards

## Product decision

Only **currently active running shoes** receive large photo-first cards. Archived/retired shoes and all other gear remain in their compact lists. Images are **manually uploaded**, not web-scraped or inferred from a model name/color. Existing Garmin gear UUIDs are the stable mapping keys. No changes to Garmin Connect, its tokens, historical activity links, 411 mappings, or distance calculations.

## Architecture

- A private Supabase Storage bucket `garmin-gear-images`, created by migration `20261105123000_garmin_gear_images.sql`. There are no public object policies.
- An owner-verified Edge Function `garmin-gear-image` accepts GET (retrieve short-lived signed image links), POST (upload one WebP under a Garmin UUID) and DELETE (remove one manually assigned image).
- Each request is validated against the existing private Garmin gear snapshot; only gear with `status=active` and `type=Shoes` / `Laufschuhe` is eligible. Historical gear never becomes a writable target.
- Client accepts JPG/PNG/WebP, resizes at most to 1400×1000, strips original metadata by re-encoding to WebP, and uploads at most 2 MiB.
- Storage filename: `gear/<canonical-garmin-uuid>.webp`—no manual filenames or URLs in the database. The browser receives temporary (1-hour) signed links, not public permanent URLs. Images stay available across browsers and devices after reloading.
- If Garmin later marks a shoe as retired, the photo remains privately stored but the UI no longer requests or displays it; if reactivated, the same mapping becomes available again.
- Missing images use a styled placeholder, not incorrect generic manufacturer photos.

## Deploy / test

Starting from clean `feature/garmin-gear-status-only-v0.7.3.4a`:
1. Fetch and switch to `feature/gear-visual-cards-v0.7.3.5`.
2. `node --test tests/garmin-gear-image.test.mjs` and `npm run build`. Optional targeted ESLint for new or modified files.
3. Check Supabase project ref `eurgupsebxypjqvyizci` and migration dry-run. Only `20261105123000_garmin_gear_images.sql` must be pending; stop if anything else is pending.
4. Apply migration `supabase db push --linked`. Deploy `supabase functions deploy garmin-gear-image --project-ref eurgupsebxypjqvyizci`. Keep JWT verification on.
5. Restart Vite on `127.0.0.1:5173`, sign in with the existing Supabase owner login, open Equipment. Five active running shoes should display image-first cards.
6. Upload one permitted product/photo image using **Foto hinzufügen**; check it persists after a browser reload. Change and remove it using the controls, verify no Garmin data changes.

## Security and rights

Upload only images you own or have permission to use. User-submitted photos are stored privately in Supabase. Signed URLs are temporary, but anyone who gets an unexpired signed URL can view that image until it expires. Do not paste such URLs into public chats.

This release does not automatically source copyrighted manufacturer product images and does not add maintenance for archived shoes. A new shoe is automatically eligible for manual image upload when Garmin marks it active and the gear snapshot is refreshed.

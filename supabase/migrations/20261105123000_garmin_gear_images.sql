-- GARMIN_AI v0.7.3.5: private, manually assigned photos for active running shoes.
-- Keeps all Garmin history and snapshot rows unchanged; no public storage access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garmin-gear-images', 'garmin-gear-images', false, 2097152, array['image/webp']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- No storage.objects policies are granted to anon/authenticated.
-- The owner-verified Edge Function alone performs uploads/deletes via service_role.

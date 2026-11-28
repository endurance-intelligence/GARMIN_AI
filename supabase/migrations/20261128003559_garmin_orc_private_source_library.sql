-- Immutable original ORC records. Not part of the reviewed archive or coach input.
create table if not exists public.garmin_orc_source (
 id uuid primary key,
 title text not null check (length(title) between 1 and 120),
 source_number integer not null check (source_number between 1 and 100),
 review_required boolean not null,
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 source_entry jsonb not null check (jsonb_typeof(source_entry)='object' and pg_column_size(source_entry)<=400000),
 image_content_type text not null check (image_content_type in ('image/png','image/jpeg','image/webp')),
 image_base64 text not null check (length(image_base64) between 4 and 3600000),
 imported_at timestamptz not null default now(),
 constraint garmin_orc_source_identity check (
  coalesce(source_entry->>'id'=id::text,false) and
  coalesce(source_entry->>'sourceImageSha256'=source_sha256,false) and
  coalesce(source_entry->>'sourceKind'='orc_reference',false) and
  coalesce(source_entry->'workout'->>'title'=title,false) and
  coalesce(source_entry->'number'=to_jsonb(source_number),false) and
  coalesce(source_entry->'reviewRequired'=to_jsonb(review_required),false)
 ),
 constraint garmin_orc_source_image_integrity check (
  encode(sha256(decode(image_base64,'base64')),'hex')=source_sha256
 )
);
alter table public.garmin_orc_source enable row level security;
revoke all on table public.garmin_orc_source from public,anon,authenticated,service_role;
grant select,insert on table public.garmin_orc_source to service_role;

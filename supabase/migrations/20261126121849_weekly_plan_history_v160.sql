create table public.garmin_weekly_plan_history (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 week_start date not null check (extract(isodow from week_start)=1),
 request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and snapshot->>'schema'='1' and snapshot->>'weekStart'=week_start::text and jsonb_typeof(snapshot->'entries')='array' and octet_length(snapshot::text)<=32000),
 unique (user_id,request_id)
);
create index garmin_weekly_plan_history_owner_week_idx on public.garmin_weekly_plan_history(user_id,week_start,created_at);
alter table public.garmin_weekly_plan_history enable row level security;
revoke all on public.garmin_weekly_plan_history from public,anon,authenticated,service_role;
grant select,insert on public.garmin_weekly_plan_history to service_role;
comment on table public.garmin_weekly_plan_history is 'Owner-authenticated Edge API only. Append-only explicit weekly plan snapshots; actual activities stay in Garmin archive.';

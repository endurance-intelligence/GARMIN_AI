import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const migration=readFileSync(new URL(
 '../supabase/migrations/20261110130321_fix_garmin_cloud_oauth_cooldown_greatest_v0923.sql',
 import.meta.url),'utf8')
test('OAuth cooldown uses valid PostgreSQL special GREATEST expression',()=>{
 assert.match(migration,/create or replace function public\.garmin_cloud_auth_guard_rate_limit\(\)/i)
 assert.match(migration,/blocked_until=greatest\(/)
 assert.doesNotMatch(migration,/pg_catalog\.greatest\s*\(/i)
 assert.match(migration,/interval '24 hours'/)
 assert.match(migration,/on conflict\(singleton\) do update/)
})
test('repair retains private role permissions and immutable guard model',()=>{
 assert.match(migration,/security definer/i)
 assert.match(migration,/set search_path to ''/i)
 assert.match(migration,/revoke all on function public\.garmin_cloud_auth_guard_rate_limit\(\) from public,anon,authenticated/i)
 assert.match(migration,/grant execute on function public\.garmin_cloud_auth_guard_rate_limit\(\) to service_role/i)
 assert.doesNotMatch(migration,/drop table|grant execute.*to public|delete from garmin_private/i)
})

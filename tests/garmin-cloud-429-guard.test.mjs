import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('cloud OIDC bridge gates Vault tokens on service-only OAuth cooldown',()=>{
  const src=read('supabase/functions/garmin-cloud-worker/index.ts')
  assert.match(src,/jwtVerify\(match\[1\],jwks/)
  assert.match(src,/trustedGarminWorkerClaims\(payload\)/)
  assert.match(src,/garmin_cloud_auth_guard_state/)
  assert.match(src,/if\(guard.allowed!==true\)return respond\(429/)
  assert.ok(src.indexOf('garmin_cloud_auth_guard_state')<src.indexOf("db.rpc('garmin_connect_session_get')"))
})

test('429 reporting requires signed OIDC and never transports Garmin tokens',()=>{
  const src=read('supabase/functions/garmin-cloud-worker/index.ts')
  assert.match(src,/value.action==='rate-limit'/)
  assert.match(src,/garmin_cloud_auth_guard_rate_limit/)
  assert.match(src,/if\(!trustedGarminWorkerClaims\(payload\)\)/)
  const audit=read('scripts/cloud/audit-garmin-connect.mjs')
  assert.match(audit,/result.kind==='rate-limited'\|\|result.status===429/)
  assert.match(audit,/action:'rate-limit'/)
  assert.match(audit,/retries:0/)
})

test('weight worker honors shared cooldown but remains double-disabled',()=>{
  const edge=read('supabase/functions/garmin-weight-worker/index.ts')
  const job=read('scripts/cloud/run-garmin-weight-delivery.mjs')
  assert.match(edge,/const LIVE_WRITES_RELEASED=false/)
  assert.match(edge,/GARMIN_WEIGHT_WRITES_ENABLED/)
  assert.match(edge,/garmin_cloud_auth_guard_state/)
  assert.match(edge,/if\(guard.allowed!==true\)return reply\(429/)
  assert.match(job,/action:'rate-limit'/)
  assert.match(job,/if\(!localEnabled\|\|payload\?\.writerEnabled!==true\)/)
})

test('private guard migration revokes public function execution',()=>{
 const sql=read('supabase/migrations/20261109141321_garmin_cloud_auth_rate_limit_guard_v092.sql')
 assert.match(sql,/garmin_private.cloud_auth_rate_limit enable row level security/i)
 assert.match(sql,/revoke all on function public.garmin_cloud_auth_guard_state\(\) from public,anon,authenticated/i)
 assert.match(sql,/revoke all on function public.garmin_cloud_auth_guard_rate_limit\(\) from public,anon,authenticated/i)
 assert.match(sql,/interval '24 hours'/)
})

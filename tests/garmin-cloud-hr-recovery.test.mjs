import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseGarminHrProfile} from '../supabase/functions/sync-garmin-hr-profile/profileParser.ts'

const running={
 sport:'RUNNING',trainingMethod:'MAX_HR',
 zone1Floor:105,zone2Floor:125,zone3Floor:145,zone4Floor:165,zone5Floor:185,
 maxHeartRate:204,restingHeartRate:46,lactateThresholdHeartRate:170
}
const standard={...running,sport:'DEFAULT',zone1Floor:110,zone2Floor:130,
 zone3Floor:150,zone4Floor:170,zone5Floor:190}
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('OAuth Garmin zones parser prefers running over default and preserves BPM',()=>{
 const profile=parseGarminHrProfile([standard,running],{})
 assert.deepEqual(profile.zones,[124,144,164,184,204])
 assert.equal(profile.zone1Min,105)
 assert.equal(profile.maxHr,204)
 assert.equal(profile.restingHr,46)
 assert.equal(profile.lthr,170)
 assert.equal(profile.sport,'running')
})
test('invalid incomplete zone data is not invented',()=>{
 assert.equal(parseGarminHrProfile([{sport:'RUNNING',maxHeartRate:204}],{}),null)
})
test('cloud runner reads only after full reviewed snapshot and never writes Garmin',()=>{
 const audit=read('scripts/cloud/audit-garmin-connect.mjs')
 assert.match(audit,/from '\.\.\/\.\.\/supabase\/functions\/sync-garmin-hr-profile\/profileParser\.ts'/)
 assert.match(audit,/garmin\.getHeartRateZones\(\)/)
 assert.match(audit,/action:'save-reviewed-hr-profile'/)
 assert.match(audit,/no recognized running profile; existing profile preserved/)
 assert.ok(audit.indexOf('completed=true')<audit.indexOf("mark('garmin-hr-zones')"))
 assert.doesNotMatch(audit,/garmin\.setHeartRateZones\(|garmin\.deleteHeartRateZones\(/)
})
test('private OIDC worker validates and stores only normalized HR profile',()=>{
 const source=read('supabase/functions/garmin-cloud-worker/index.ts')
 assert.match(source,/jwtVerify\(match\[1\],jwks/)
 assert.match(source,/trustedGarminWorkerClaims\(payload\)/)
 assert.match(source,/value.action==='save-reviewed-hr-profile'/)
 assert.match(source,/p.sport!=='running'/)
 assert.match(source,/zones.length!==5/)
 assert.match(source,/zones.some\(\(z:unknown\)=>!validBpm/)
 assert.match(source,/source:'garmin-cloud-oidc'/)
 assert.match(source,/garmin_hr_profile_sync_status/)
 assert.match(source,/last_success_at:now,last_error:null/)
})
test('writer gates for weight and calendar remain fixed off',()=>{
 const weight=read('supabase/functions/garmin-weight-worker/index.ts')
 const calendar=read('supabase/functions/garmin-calendar-worker/index.ts')
 assert.match(weight,/const LIVE_WRITES_RELEASED=false/)
 assert.match(calendar,/const LIVE_WRITES_RELEASED=false/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildCloudPreview} from '../scripts/cloud/garmin-cloud-data-audit-model.mjs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

const id='0123456789abcdef0123456789abcdef'
const g=[{uuid:id,displayName:'Running Shoes',gearStatusName:'active',gearTypeName:'Shoes'}]
const cal=[{scheduleDate:'2026-11-12',scheduledWorkoutId:199,workoutName:'Locker'}]
const history=[[{activityId:24725092836}]]
const base={gear:[{id,name:'Running Shoes',status:'active'}],activity_gear:[],schedule:[]}

test('verified cloud read yields transportable, sanitized complete snapshot',()=>{
 const v=buildCloudPreview({rawGear:g,rawCalendar:cal,activityLists:history,baseline:base,
   windowStart:'2026-11-01',windowEnd:'2026-12-01'})
 assert.equal(v.complete,true)
 assert.equal(v.snapshot.gear.length,1)
 assert.equal(v.snapshot.schedule.length,1)
 assert.deepEqual(v.snapshot.activityGear,[{activityId:'24725092836',gearId:id}])
 assert.equal(v.totals.links,1)
})

test('refuse truncated gear history rather than overwriting complete snapshot',()=>{
 assert.throws(()=>buildCloudPreview({rawGear:g,rawCalendar:cal,
  activityLists:[Array.from({length:1000},(_,i)=>({activityId:10000000000+i}))],
  baseline:base}),/truncated/)
})

test('cloud snapshot is protected by signed OIDC and optimistic comparison',()=>{
 const e=read('supabase/functions/garmin-cloud-worker/index.ts')
 assert.match(e,/jwtVerify\(match\[1\],jwks/)
 assert.match(e,/trustedGarminWorkerClaims\(payload\)/)
 assert.match(e,/value.action==='save-reviewed-snapshot'/)
 assert.match(e,/previous.synced_at!==value.expectedSyncedAt/)
 assert.match(e,/\.eq\('synced_at',previous.synced_at\)/)
 assert.match(e,/previousGear.some/)
 assert.match(e,/links.length<previousLinks.length\*0.7/)
 assert.match(e,/gear_links_checked_at:now/)
})

test('cloud runner skips OAuth guard and only writes Supabase after full validation',()=>{
 const s=read('scripts/cloud/audit-garmin-connect.mjs')
 assert.match(s,/credential\?\.mode==='cooldown'/)
 assert.match(s,/if\(credential\?\.mode==='cooldown'\)/)
 assert.ok(s.indexOf('buildCloudPreview(')<s.indexOf("mark('save-reviewed-snapshot')"))
 assert.match(s,/action:'save-reviewed-snapshot'/)
 assert.match(s,/expectedSyncedAt:baseline.synced_at/)
 assert.match(s,/retries:0/)
 assert.doesNotMatch(s,/scheduleWorkout\(|uploadWorkout\(|createCalendarEvent\(/)
})

test('new private snapshot service does not enable Garmin weight writes',()=>{
 const w=read('supabase/functions/garmin-weight-worker/index.ts')
 assert.match(w,/const LIVE_WRITES_RELEASED=false/)
})

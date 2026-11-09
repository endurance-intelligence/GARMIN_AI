import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessCalendarDay,verifyScheduledWorkout,validDate}
 from '../scripts/cloud/garmin-calendar-reconciliation.mjs'
import {deliverOneCalendarWorkout}
 from '../scripts/cloud/garmin-calendar-delivery.mjs'
import {trustedCalendarWorkflowClaims}
 from '../supabase/functions/_shared/garmin-calendar-worker-claims.mjs'

const date='2026-11-12'
const task={available:true,id:'01234567-89ab-4def-8abc-0123456789ab',date,revision:2,workoutId:98765}
const remote=(id=1234)=>[{scheduleDate:date,workoutId:98765,scheduledWorkoutId:id}]
function harness(before=[],after=remote()) {
 const counts={reads:0,writes:0,claims:0,confirms:0,finishes:[]}
 const db={
  nextPending:async()=>task,
  claim:async()=>{counts.claims++;return {claimed:true,attemptId:'abc'}},
  confirmExisting:async()=>{counts.confirms++;return {saved:true}},
  finish:async(_,attempt,decision)=>{
   counts.finishes.push({attempt,decision});return {saved:true}
  }
 }
 const garmin={
  getScheduledWorkoutSummaries:async()=>{counts.reads++;return counts.reads===1?before:after},
  scheduleWorkout:async()=>{counts.writes++;return {workoutId:98765}}
 }
 return {counts,db,garmin}
}

test('Garmin date and IDs are strictly normalized',()=>{
 assert.equal(validDate('2026-02-30'),false)
 assert.equal(validDate(date),true)
 assert.deepEqual(assessCalendarDay(task,remote()),{
  status:'already_present',code:'already_present',remoteId:'1234'})
 assert.deepEqual(verifyScheduledWorkout(task,[]),{
  status:'needs_review',code:'write_not_visible',remoteId:null})
})

test('remote match confirms without scheduling a duplicate',async()=>{
 const h=harness(remote())
 const r=await deliverOneCalendarWorkout({...h,writesEnabled:true})
 assert.deepEqual(r,{state:'confirmed',code:'already_present'})
 assert.equal(h.counts.writes,0)
 assert.equal(h.counts.claims,0)
 assert.equal(h.counts.confirms,1)
})

test('a new workout is scheduled only after DB claim and confirmed by readback',async()=>{
 const h=harness([],remote())
 const r=await deliverOneCalendarWorkout({...h,writesEnabled:true})
 assert.deepEqual(r,{state:'confirmed',code:'verified_read_back'})
 assert.equal(h.counts.writes,1)
 assert.equal(h.counts.claims,1)
 assert.equal(h.counts.finishes[0].decision.remoteId,'1234')
})

test('ambiguous existing duplicates are never written again',async()=>{
 const h=harness([...remote(1234),...remote(1235)])
 const r=await deliverOneCalendarWorkout({...h,writesEnabled:true})
 assert.equal(r.state,'needs_review')
 assert.equal(h.counts.claims,0)
 assert.equal(h.counts.writes,0)
})

test('unconfirmed remote write is quarantined, not retried',async()=>{
 const h=harness([],[])
 const r=await deliverOneCalendarWorkout({...h,writesEnabled:true})
 assert.deepEqual(r,{state:'needs_review',code:'write_not_visible'})
 assert.equal(h.counts.writes,1)
 assert.equal(h.counts.finishes[0].decision.status,'needs_review')
})

test('a failed DB claim never triggers Garmin',async()=>{
 const h=harness([],remote())
 h.db.claim=async()=>({claimed:false})
 const r=await deliverOneCalendarWorkout({...h,writesEnabled:true})
 assert.equal(r.code,'concurrent_change')
 assert.equal(h.counts.writes,0)
})

test('read or write failures cannot be interpreted as successful transfer',async()=>{
 const h=harness([],remote())
 h.garmin.scheduleWorkout=async()=>{h.counts.writes++;throw {name:'GarminConnectionError'}}
 const r=await deliverOneCalendarWorkout({...h,writesEnabled:true})
 assert.deepEqual(r,{state:'needs_review',code:'network_uncertain'})
 assert.equal(h.counts.finishes.length,1)
 assert.equal(h.counts.writes,1)
})

test('dry run never schedules, claims or confirms',async()=>{
 const h=harness([],remote())
 const r=await deliverOneCalendarWorkout({...h,writesEnabled:false})
 assert.equal(r.state,'preview')
 assert.equal(h.counts.writes,0)
 assert.equal(h.counts.claims,0)
})

test('OIDC identity accepts only exact manual workflow on main',()=>{
 const p={
  repository:'endurance-intelligence/GARMIN_AI',repository_id:'1443154844',
  ref:'refs/heads/main',ref_type:'branch',
  workflow_ref:'endurance-intelligence/GARMIN_AI/.github/workflows/garmin-calendar-delivery.yml@refs/heads/main',
  runner_environment:'github-hosted',event_name:'workflow_dispatch'
 }
 assert.equal(trustedCalendarWorkflowClaims(p),true)
 for(const key of ['repository_id','ref','workflow_ref','event_name','runner_environment']){
  assert.equal(trustedCalendarWorkflowClaims({...p,[key]:'untrusted'}),false)
 }
})

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('calendar worker is permanently locked and signed GitHub JWT only',()=>{
 const src=read('supabase/functions/garmin-calendar-worker/index.ts')
 assert.match(src,/const LIVE_WRITES_RELEASED=false/)
 assert.match(src,/jwtVerify\(bearer\[1\],keys/)
 assert.match(src,/trustedCalendarWorkflowClaims\(payload\)/)
 assert.match(src,/if\(!writeAuthorized\)return reply\(200/)
 assert.match(src,/if\(!writeAuthorized\)return reply\(403/)
 assert.match(src,/garmin_cloud_auth_guard_state/)
 assert.match(src,/garmin_calendar_claim/)
})

test('all privileged RPCs revoke public execution and use CAS',()=>{
 const sql=read('supabase/migrations/20261109155500_garmin_calendar_delivery_safety_v095.sql')
 for(const fn of ['garmin_calendar_next_pending','garmin_calendar_claim',
   'garmin_calendar_confirm_existing','garmin_calendar_finish']){
  assert.ok(sql.includes('function public.'+fn))
  assert.match(sql,new RegExp('revoke all on function public\\.'+fn))
 }
 assert.match(sql,/state='pending'/)
 assert.match(sql,/state='sending' and attempt_id=p_attempt_id/)
 assert.match(sql,/attempt_count=0/)
})

test('runner has separate opt-in and zero automatic retries',()=>{
 const run=read('scripts/cloud/run-garmin-calendar-delivery.mjs')
 assert.match(run,/GARMIN_CALENDAR_WRITES_ENABLED==='true'/)
 assert.match(run,/if\(!locallyEnabled\|\|response\?\.writerEnabled!==true\)/)
 assert.match(run,/retries:0/)
 assert.match(run,/setTimeout\(resolve,6000\)/)
 assert.doesNotMatch(run,/setInterval|retryCount|for\(.*retry/)
})

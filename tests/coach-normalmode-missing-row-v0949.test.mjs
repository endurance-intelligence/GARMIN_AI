import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {coachWorkoutAllowed,buildCoachStructuredSnapshot} from '../supabase/functions/_shared/coach-structured-workout.mjs'
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const sunday='2026-11-15'
const well={illness_state:'well',return_started_on:null,blocked_periods:[]}
test('first-time owner without a saved life-context row matches Coach Normalmodus',()=>{
 // Database maybeSingle() returns null, NOT an error, for zero matching rows.
 assert.equal(coachWorkoutAllowed(null,'easy',sunday),true)
 assert.equal(coachWorkoutAllowed(null,'long',sunday),true)
 assert.equal(coachWorkoutAllowed(null,'return_easy',sunday),false)
 assert.equal(coachWorkoutAllowed(null,'easy',sunday),coachWorkoutAllowed(well,'easy',sunday))
 const draft=buildCoachStructuredSnapshot({
  kind:'easy',minutes:30,title:'Kurzer lockerer Lauf',startTime:'10:00'})
 assert.ok(draft)
 assert.equal(draft.sourceKind,'coach')
 assert.equal(draft.startTime,'10:00')
})
test('missing row is special: an error, undefined state or corrupt state still fails closed',()=>{
 assert.equal(coachWorkoutAllowed(undefined,'easy',sunday),false)
 assert.equal(coachWorkoutAllowed({},'easy',sunday),false)
 assert.equal(coachWorkoutAllowed({illness_state:'well'},'easy',sunday),false)
 assert.equal(coachWorkoutAllowed({illness_state:'unknown',blocked_periods:[]},'easy',sunday),false)
 assert.equal(coachWorkoutAllowed(null,'tempo',sunday),false)
 assert.equal(coachWorkoutAllowed(null,'easy','invalid'),false)
})
test('real illness, return-to-running and vacation are still respected',()=>{
 assert.equal(coachWorkoutAllowed({...well,illness_state:'sick'},'easy',sunday),false)
 assert.equal(coachWorkoutAllowed({...well,illness_state:'returning'},'easy',sunday),false)
 assert.equal(coachWorkoutAllowed({...well,illness_state:'returning'},'return_easy',sunday),true)
 const vacation={...well,blocked_periods:[{start:'2026-11-14',end:'2026-11-16',reason:'vacation'}]}
 assert.equal(coachWorkoutAllowed(vacation,'easy',sunday),false)
 assert.equal(coachWorkoutAllowed({...well,return_started_on:'2026-11-08'},'long',sunday),false)
})
test('one shared three-stage gate is used by draft, later approval and Intervals publish',()=>{
 const plan=file('supabase/functions/garmin-training-plan/index.ts')
 const intervals=file('supabase/functions/garmin-intervals/index.ts')
 const context=file('supabase/functions/garmin-coach-context/index.ts')
 const policy=file('supabase/functions/_shared/coach-structured-workout.mjs')
 assert.match(plan,/\.maybeSingle\(\)/)
 assert.match(plan,/contextError\|\|!coachWorkoutAllowed\(context,input\.kind,input\.date\)/)
 assert.match(plan,/contextError\|\|!coachWorkoutAllowed\(context,source\.coachKind,current\.training_date\)/)
 assert.match(intervals,/contextError\|\|!coachWorkoutAllowed\(context,/)
 assert.match(intervals,/plan\.state!=='pending'\|\|!plan\.approved_at/)
 assert.match(context,/let row=\(current\|\|empty\(user\.id\)\)/)
 assert.match(policy,/context===null\?\{/)
 assert.match(policy,/!Array\.isArray\(state\.blocked_periods\)/)
 assert.doesNotMatch(plan,/garmin-connect\.com\/api\/.*POST|addGearToActivity/)
 assert.doesNotMatch(intervals,/garmin-connect\.com\/api\//)
})

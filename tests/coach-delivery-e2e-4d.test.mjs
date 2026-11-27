import test from 'node:test'
import assert from 'node:assert/strict'
import {buildCoachStructuredSnapshot,coachWorkoutAllowed} from '../supabase/functions/_shared/coach-structured-workout.mjs'
import {assessPlanActual} from '../src/lib/planActual.mjs'
const day='2025-05-12'
test('the full supported long run duration can be compared without fabricating a distance',()=>{
 const snapshot=buildCoachStructuredSnapshot({kind:'long',minutes:150,title:'Synthetic long run',startTime:'09:00'})
 assert.ok(snapshot)
 const plan={id:'fixture',training_date:day,title:snapshot.title,state:'pending',sport:'running',archive_snapshot:snapshot}
 const actual={id:'a',date:day+' 09:10:00',sport:'running',durationS:8940,avgHr:null,distanceM:null}
 const match=assessPlanActual(actual,[actual],[plan])
 assert.equal(match.status,'matched')
 assert.equal(match.plan.plannedMinutes,150)
 assert.equal(match.plan.actualMinutes,149)
 assert.equal(match.plan.distanceM,null)
 assert.equal(assessPlanActual(actual,[actual],[{...plan,state:'draft'}]).status,'no-plan')
})
test('revalidation blocks workouts when life context has changed',()=>{
 assert.equal(coachWorkoutAllowed({illness_state:'sick',blocked_periods:[]},'easy',day),false)
 assert.equal(coachWorkoutAllowed({illness_state:'well',blocked_periods:[{start:day,end:day}]},'long',day),false)
 assert.equal(coachWorkoutAllowed({illness_state:'returning',blocked_periods:[]},'intervals',day),false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessPlanActual} from '../src/lib/planActual.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const snapshot=(start='10:00',seconds=1200)=>({
 sourceKind:'coach',coachKind:'easy',startTime:start,
 warmup:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:seconds}]},
 cooldown:{durationSeconds:300}
})
const plan=(time='10:00')=>({
 id:'e3a6adf2-6ef0-4f9c-a04d-cc2e9f923eae',training_date:'2026-11-15',
 title:'Kurzer lockerer Lauf',state:'pending',sport:'running',archive_snapshot:snapshot(time)
})
const activity=(id='25090000001',time='10:10:22',duration=1920)=>({
 id,name:'Lage locker',date:'2026-11-15 '+time,sport:'running',
 durationS:duration,avgHr:131,distanceM:5100
})
test('single same-day Garmin run near planned start gives transparent measurable 30 vs 32 min',()=>{
 const a=activity()
 const result=assessPlanActual(a,[a],[plan()])
 assert.equal(result.status,'matched')
 assert.equal(result.plan?.id,plan().id)
 assert.equal(result.plan?.plannedMinutes,30)
 assert.equal(result.plan?.actualMinutes,32)
 assert.equal(result.plan?.durationDeltaMinutes,2)
 assert.equal(result.plan?.avgHr,131)
 assert.equal(result.plan?.distanceM,5100)
 assert.equal(result.plan?.startDeltaMinutes,10)
 assert.equal(result.plan?.coachKind,'easy')
 assert.match(result.reason,/Plausible Zuordnung, kein Nachweis/)
})
test('exact same date without matching time is not an automatic workout link',()=>{
 const a=activity('25090000002','18:30:00')
 const result=assessPlanActual(a,[a],[plan()])
 assert.equal(result.status,'possible')
 assert.equal(result.plan,null)
 assert.match(result.reason,/mehr als 90 Minuten/)
})
test('multiple running activities on one day remain ambiguous, do not invent proof',()=>{
 const a=activity('25090000003','10:05:00')
 const b=activity('25090000004','17:00:00')
 const result=assessPlanActual(a,[a,b],[plan()])
 assert.equal(result.status,'ambiguous')
 assert.equal(result.plan,null)
})
test('only approved Coach workouts are considered, not an unsent draft',()=>{
 const a=activity()
 assert.equal(assessPlanActual(a,[a],[{...plan(),state:'draft'}]).status,'no-plan')
 assert.equal(assessPlanActual(a,[a],[{...plan(),state:'cancelled'}]).status,'no-plan')
 assert.equal(assessPlanActual(a,[a],[{...plan(),sport:'strength'}]).status,'no-plan')
 assert.equal(assessPlanActual(a,[a],[plan()]).status,'matched')
})
test('no real plan and no Garmin activity, or incomplete data, cannot claim a match',()=>{
 const a=activity()
 assert.equal(assessPlanActual(a,[a],[]).status,'no-plan')
 assert.equal(assessPlanActual(a,[],[plan()]).status,'ambiguous')
 assert.equal(assessPlanActual(a,[a],null).status,'unavailable')
 assert.equal(assessPlanActual(null,[a],[plan()]).status,'no-link')
 assert.equal(assessPlanActual({...a,sport:'soccer'},[a],[plan()]).status,'no-link')
})
test('legacy non-Coach or LAP-driven workouts must not get fabricated durations',()=>{
 const a=activity()
 const archive=plan()
 archive.archive_snapshot={sourceKind:'archive',coachKind:'easy',startTime:'10:00'}
 assert.equal(assessPlanActual(a,[a],[archive]).status,'unsupported')
 const lap=plan()
 lap.archive_snapshot.group.steps[0].endMode='lap'
 assert.equal(assessPlanActual(a,[a],[lap]).status,'unsupported')
})
test('missing time or measured HR yields no invented workout-quality or measured duration',()=>{
 const a=activity('25090000005','10:12:00',null)
 a.avgHr=null;a.distanceM=null
 const result=assessPlanActual(a,[a],[plan()])
 assert.equal(result.status,'matched')
 assert.equal(result.plan?.actualMinutes,null)
 assert.equal(result.plan?.durationDeltaMinutes,null)
 assert.equal(result.plan?.avgHr,null)
 assert.equal(result.plan?.distanceM,null)
 assert.equal(assessPlanActual(a,[a],[plan('')]).status,'possible')
})
test('owner-only API exposes structured plan context without extending Garmin rights',()=>{
 const edge=read('supabase/functions/garmin-training-plan/index.ts')
 const analyst=read('src/components/LiveSessionAnalyst.tsx')
 const goal=read('src/components/SessionGoalReview.tsx')
 const cmp=read('src/components/PlanActualReview.tsx')
 assert.match(edge,/intervals_export_version,archive_snapshot,created_at/)
 assert.match(edge,/auth\.auth\.getUser\(match\[1\]\)/)
 assert.match(edge,/user\.email_confirmed_at/)
 assert.match(analyst,/readOwnerPlans\(session\)/)
 assert.match(analyst,/assessPlanActual\(selectedActivity,list,planEntries\)/)
 assert.match(analyst,/<PlanActualReview match=\{planActual\}/)
 assert.match(analyst,/plannedGoal=\{plannedGoal==='easy'/)
 assert.match(goal,/current\.touched\?current\.goal/)
 assert.match(goal,/plannedGoal==='return_easy'\?'recovery'/)
 assert.match(cmp,/Plausibel zugeordnet/)
 assert.match(cmp,/Messwerte, keine Qualitätsnote/)
 assert.match(cmp,/Keine Zuordnung behauptet/)
 assert.doesNotMatch(analyst,/action:'publish'|garmin-connect\.com\/.*POST/)
})

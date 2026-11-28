import test from 'node:test'
import assert from 'node:assert/strict'
import {compareIntervalTargets,intervalTargetVerdict} from '../src/lib/intervalTargetComparison.mjs'
import {assessTrainingPurpose} from '../src/lib/trainingPurposeAssessment.mjs'
const activity={id:'r',sport:'track_running',date:'2026-11-28 09:06:00'}
const run=(distanceMeters,paceSecondsPerKm,notes='')=>({kind:'run',distanceMeters,paceSecondsPerKm,notes})
const steps=[run(1000,275),{kind:'recovery',distanceMeters:200},run(200,220),{kind:'recovery',durationSeconds:60,notes:'Trinkpause'},run(1000,275)]
const plan={id:'p',title:'1000/200 · Wolf',training_date:'2026-11-28',sport:'running',state:'pending',revision:2,intervals_published_revision:2,intervals_sync_status:'confirmed',intervals_event_id:123,archive_snapshot:{group:{name:'Wolf',steps}}}
const lap=(repeat,distanceM,paceSeconds)=>({repeat,distanceM,paceSeconds,durationS:distanceM*paceSeconds/1000,avgHr:160})
const review={activityId:'r',type:'intervals',quality:'fit-intervals',intervals:[lap(1,1002,274),lap(2,198,222),lap(3,1005,277)]}
const compare=(patch={})=>compareIntervalTargets({activity,activities:[activity],plans:[plan],review,...patch})
test('mixed distances and deliberately different targets, jog and drink not counted',()=>{
 const c=compare()
 assert.equal(c.status,'plausible')
 assert.equal(c.expected,3);assert.equal(c.near,3)
 assert.equal(c.rows[1].targetPace,220)
 assert.equal(intervalTargetVerdict(c).mode,'positive')
 const r=assessTrainingPurpose({activity,review,intervalComparison:c,rpe:7})
 assert.match(r.verdict,/nah an der Vorgabe/)
})
test('relative target deviations detect starting too fast and fading without comparing raw pace',()=>{
 const c=compare({review:{...review,intervals:[lap(1,1000,250),lap(2,200,220),lap(3,1000,295)]}})
 assert.equal(c.fade,true)
 assert.equal(intervalTargetVerdict(c).mode,'caution')
})
test('missing or extra repetitions, wrong order, truncated evidence and wrong activity are not shifted',()=>{
 for(const intervals of [review.intervals.slice(0,2),[...review.intervals,lap(4,1000,275)],[lap(1,200,220),lap(2,1000,275),lap(3,1000,275)]]){
  assert.equal(compare({review:{...review,intervals}}).status,'unavailable')
 }
 assert.equal(compare({review:{...review,activityId:'other'}}).status,'unavailable')
})
test('unpublished revisions, another plan, another run, and incompatible time are not matched',()=>{
 for(const patch of [{plans:[{...plan,revision:3}]},{plans:[plan,{...plan,id:'p2'}]},{activities:[activity,{...activity,id:'r2'}]},{activity:{...activity,date:'2026-11-28 13:00:00'}},{plans:[{...plan,state:'draft'}]}]){
  assert.equal(compare(patch).status,'unavailable')
 }
})
test('range / flexible notes never graded as single exact target',()=>{
 const c=compare({plans:[{...plan,archive_snapshot:{group:{name:'Wolf',steps:[run(1000,275,'4:35–4:45'),...steps.slice(1)]}}}]})
 assert.equal(c.rows[0].status,'reference-only')
 assert.equal(c.judged,2)
 assert.equal(intervalTargetVerdict(c).mode,'review')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {assessTrainingPurpose,measuredHrExposure} from '../src/lib/trainingPurposeAssessment.mjs'
import {buildSessionContext} from '../src/lib/sessionContext.mjs'
const activity={id:'a',name:'Laufen',sport:'running',date:'2026-11-28 09:00:00',durationS:3600,distanceM:9000,avgHr:150,rpeRaw:20}
const match={status:'matched',plan:{coachKind:'easy'}}
const ref={activityId:'a',source:'intervals-current',upperBpm:145}
const samples=(f)=>Array.from({length:601},(_,i)=>({elapsed:i*6,hr:f(i)}))
test('a planned easy run with sustained excess HF is not praised for low RPE',()=>{
 const r=assessTrainingPurpose({activity,match,samples:samples(i=>i<120?135:160),zoneReference:ref,rpe:2})
 assert.equal(r.mode,'caution')
 assert.match(r.verdict,/Zu intensiv/)
 assert.match(r.recommendation,/niedriges RPE/)
 assert.match(r.evidence[1].detail,/keine historisch bestätigte/)
 assert.match(r.next,/Erholung/)
 const context=buildSessionContext(activity,[activity],[],null,{match,samples:samples(()=>160),zoneReference:ref})
 assert.equal(context.mode,'caution')
})
test('short uphill spikes do not trigger a sustained-excess verdict',()=>{
 const r=assessTrainingPurpose({activity,match,samples:samples(i=>i>250&&i<280?165:135),zoneReference:ref,rpe:2})
 assert.equal(r.mode,'positive')
})
test('subjectively hard easy run is flagged even without HF data',()=>{
 assert.equal(assessTrainingPurpose({activity,match,rpe:8}).mode,'caution')
})
test('missing reference, missing samples, unknown plan, and mismatched activity do not manufacture a target',()=>{
 assert.equal(assessTrainingPurpose({activity,match,rpe:2}).mode,'review')
 assert.equal(assessTrainingPurpose({activity,match:{status:'possible'},samples:samples(()=>175),zoneReference:ref,rpe:2}),null)
 assert.equal(assessTrainingPurpose({activity,match,samples:samples(()=>175),zoneReference:{...ref,activityId:'b'},rpe:2}).mode,'review')
 assert.equal(measuredHrExposure(samples(i=>i%2?160:null),145),null)
 assert.equal(measuredHrExposure(samples(()=>160).map((x,i)=>({...x,elapsed:i>300?x.elapsed+3600:x.elapsed})),145),null)
})
test('FIT intervals are the primary evidence, even with slow average pace and hard RPE',()=>{
 const review={activityId:'a',type:'intervals',quality:'fit-intervals',intervals:[{distanceM:1000,durationS:275,paceSeconds:275,avgHr:160},{distanceM:200,durationS:45,paceSeconds:225,avgHr:166}]}
 const r=assessTrainingPurpose({activity,review,rpe:8})
 assert.match(r.verdict,/2 Belastungen/)
 assert.match(r.recommendation,/Unterschiedliche Intervalllängen/)
 assert.match(r.recommendation,/keine.*Soll-Ist|eindeutige Soll-Ist/)
 assert.equal(r.mode,'review')
 assert.equal(buildSessionContext({...activity,rpeRaw:80},[],[],null,{review}).purpose.kind,'intervals')
})
test('known interval session without FIT does not fall back to positive RPE grade',()=>{
 const r=assessTrainingPurpose({activity:{...activity,sport:'track_running'},rpe:2})
 assert.equal(r.mode,'review')
 assert.match(r.recommendation,/noch nicht eindeutig/)
})
test('post-ultra recovery guardrail remains active with purpose evidence',()=>{
 const ultra={...activity,id:'u',date:'2026-11-25 07:00:00',distanceM:50000}
 const r=buildSessionContext(activity,[ultra,activity],[],null,{match,samples:samples(()=>135),zoneReference:ref})
 assert.equal(r.mode,'caution')
 assert.equal(r.mood,'firm')
 assert.equal(r.purpose.mode,'positive')
})

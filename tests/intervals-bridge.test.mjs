import test from 'node:test'
import assert from 'node:assert/strict'
import {
 buildIntervalsWorkout,buildIntervalsEvent,validateStoredIntervalsWorkout,workoutLocalTime
} from '../supabase/functions/_shared/intervals-workout.mjs'
const base={
 id:'01234567-89ab-4cde-8abc-1234567890ab',training_date:'2026-11-10',
 title:'Schwelle im Wechsel · Wolf',archive_snapshot:{
  group:{name:'Wolf',steps:[
   {kind:'run',distanceMeters:1000,durationSeconds:null,paceSecondsPerKm:260,endMode:'lap'},
   {kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:null,endMode:'lap'},
   {kind:'run',distanceMeters:800,durationSeconds:null,paceSecondsPerKm:260,endMode:'distance'}
  ]},
  warmup:{distanceMeters:2000,durationSeconds:null,endMode:'lap'},
  cooldown:{distanceMeters:800,durationSeconds:null,endMode:'lap'}
 }
}
test('never outputs 60m placeholder or unparseable 1000M/200M labels',()=>{
 const s=buildIntervalsWorkout(base.archive_snapshot,base.title)
 assert.doesNotMatch(s.description,/\b60m\b|\b(?:1000|200|800|2000)M\b/)
 assert.match(s.description,/- Press lap EINLAUFEN 2000er 12m intensity=warmup/)
 assert.match(s.description,/- Press lap LAUF 1000er 4m20s 4:10-4:30\/km Pace intensity=interval/)
 assert.match(s.description,/- Press lap TRAB 200er 1m25s intensity=recovery/)
 assert.match(s.description,/- LAUF 800er 800mtr 4:10-4:30\/km Pace intensity=interval/)
 assert.match(s.description,/- Press lap AUSLAUFEN 800er 4m50s intensity=cooldown/)
 assert.equal(s.stepCount,5)
})
test('ORC actual training times not arbitrary 18:00',()=>{
 assert.equal(workoutLocalTime('2026-11-10'),'19:00')
 assert.equal(workoutLocalTime('2026-11-14'),'09:00')
 const item=buildIntervalsEvent(base)
 assert.equal(item.start_date_local,'2026-11-10T19:00:00')
 assert.equal(item.external_id,'garmin-ai:'+base.id)
 assert.equal(item.type,'Run')
})
test('distance steps are distinct from lap steps',()=>{
 const steps=buildIntervalsWorkout(base.archive_snapshot,base.title).steps
 assert.equal(steps[3].mode,'distance')
 assert.equal(steps[3].dist,800)
 assert.doesNotMatch(steps[3].line,/Press lap/)
 for(const s of steps.filter(x=>x.mode==='lap')){
  assert.match(s.line,/^- Press lap /)
  assert.doesNotMatch(s.line,/ \d+mtr /)
 }
})
function stored(){
 const event=buildIntervalsEvent(base)
 const transfer=buildIntervalsWorkout(base.archive_snapshot,base.title)
 return {event,remote:{...event,id:154224952,moving_time:3500,distance:6000,
  workout_doc:{steps:transfer.steps.map(s=>({
   until_lap_press:s.mode==='lap',
   ...(s.mode==='distance'?{distance:s.dist}:{}),
   ...(s.paceSecondsPerKm!==null?{pace:{
    start:s.paceSecondsPerKm-10,end:s.paceSecondsPerKm+10,units:'secs/km'
   }}:{})
  }))}}}
}
test('accepts correctly parsed pace, distance and LAP controls',()=>{
 const {event,remote}=stored()
 assert.deepEqual(validateStoredIntervalsWorkout(remote,base.archive_snapshot,event),
  {ok:true,reason:'parsed'})
})
test('refuses the actual 207-hour 1971-km screenshot failure',()=>{
 const {event,remote}=stored()
 remote.moving_time=207*3600
 remote.distance=1971000
 assert.equal(validateStoredIntervalsWorkout(remote,base.archive_snapshot,event).ok,false)
})
test('refuses wrongly parsed 1000M as hours or kilometers',()=>{
 const {event,remote}=stored()
 remote.workout_doc.steps[1].until_lap_press=false
 assert.match(validateStoredIntervalsWorkout(remote,base.archive_snapshot,event).reason,/LAP/)
})
test('refuses a lost distance or pace target',()=>{
 const {event,remote}=stored()
 remote.workout_doc.steps[3].distance=500
 assert.match(validateStoredIntervalsWorkout(remote,base.archive_snapshot,event).reason,/Distance/)
 remote.workout_doc.steps[3].distance=800
 remote.workout_doc.steps[1].pace.start=200
 assert.match(validateStoredIntervalsWorkout(remote,base.archive_snapshot,event).reason,/Pace/)
})
test('refuses event time mismatch and incomplete step parsing',()=>{
 const {event,remote}=stored()
 remote.start_date_local='2026-11-10T18:00:00'
 assert.match(validateStoredIntervalsWorkout(remote,base.archive_snapshot,event).reason,/start time/)
 remote.start_date_local=event.start_date_local
 remote.workout_doc.steps.pop()
 assert.match(validateStoredIntervalsWorkout(remote,base.archive_snapshot,event).reason,/count/)
})
test('selected Wolf group only and max 50 step safeguard',()=>{
 const s=buildIntervalsWorkout(base.archive_snapshot,base.title)
 assert.ok(!s.description.includes('Bären'))
 const clone=structuredClone(base.archive_snapshot)
 clone.group.steps=Array.from({length:49},()=>({...clone.group.steps[0]}))
 assert.throws(()=>buildIntervalsWorkout(clone,'x'),/50/)
})
test('unknown pace and invalid distance fail closed',()=>{
 const clone=structuredClone(base.archive_snapshot)
 clone.group.steps[0].paceSecondsPerKm=0
 assert.throws(()=>buildIntervalsWorkout(clone,'x'),/pace/)
 clone.group.steps[0].paceSecondsPerKm=260
 clone.group.steps[2].distanceMeters=null
 assert.throws(()=>buildIntervalsWorkout(clone,'x'),/distance/)
})
test('no private Garmin endpoint involved',()=>{
 const x=buildIntervalsEvent(base)
 assert.doesNotMatch(JSON.stringify(x),/connectapi\.garmin\.com|oauth/i)
})

test('numbered step prompts preserve controls and separate drink break',()=>{
 const snap=structuredClone(base.archive_snapshot)
 snap.group.steps[0].notes='L1: 0:52 | 1:44 | 2:36 | 3:28 | 4:20 · original comment'
 snap.group.steps[1].notes='T1: 1:25'
 snap.group.steps[2].notes='L2: 0:52 | 1:44 | 2:36 | 3:28'
 snap.group.steps.splice(2,0,{kind:'recovery',durationSeconds:30,distanceMeters:null,endMode:'time',notes:'Trinkpause: 0:30'})
 const w=buildIntervalsWorkout(snap,base.title)
 assert.equal(w.steps[1].line,'- Press lap (L1: 0:52|1:44|2:36|3:28|4:20) 4m20s 4:10-4:30/km Pace intensity=interval')
 assert.equal(w.steps[2].line,'- Press lap (T1: 1:25) 1m25s intensity=recovery')
 assert.equal(w.steps[3].line,'- (Trinkpause: 0:30) 30s intensity=recovery')
 assert.equal(w.steps[4].line,'- (L2: 0:52|1:44|2:36|3:28) 800mtr 4:10-4:30/km Pace intensity=interval')
 const event=buildIntervalsEvent({...base,archive_snapshot:snap})
 const remote={...event,moving_time:3500,distance:6000,workout_doc:{steps:w.steps.map(s=>({
  until_lap_press:s.mode==='lap',
  text:s.prompt?'('+s.prompt+')':undefined,
  ...(s.mode==='distance'?{distance:s.dist}:{}),
  ...(s.mode==='time'?{duration:s.durationSeconds}:{}),
  ...(s.paceSecondsPerKm!==null?{pace:{start:s.paceSecondsPerKm-10,end:s.paceSecondsPerKm+10,units:'secs/km'}}:{})
 }))}}
 assert.equal(validateStoredIntervalsWorkout(remote,snap,event).ok,true)
 remote.workout_doc.steps[1].text='L1: 0:52'
 assert.match(validateStoredIntervalsWorkout(remote,snap,event).reason,/Step comment/)
 remote.workout_doc.steps[1].text='Press lap ('+w.steps[1].prompt+')'
 assert.equal(validateStoredIntervalsWorkout(remote,snap,event).ok,true)
 remote.workout_doc.steps[3].duration=600
 assert.match(validateStoredIntervalsWorkout(remote,snap,event).reason,/Timed step/)
})
test('arbitrary numeric trainer text cannot enter workout grammar',()=>{
 const snap=structuredClone(base.archive_snapshot)
 snap.group.steps[0].notes='L1: 0:55 1000m 90% intensity=rest'
 snap.group.steps[1].notes='Trinkpause: 1:00 200m'
 const w=buildIntervalsWorkout(snap,base.title)
 assert.equal(w.steps[1].prompt,'')
 assert.equal(w.steps[2].prompt,'')
 assert.match(w.steps[1].line,/LAUF 1000er/)
 assert.match(w.steps[2].line,/TRAB 200er/)
})

test('real Intervals parser regression: compact pipes preserve full step text, spaced pipes truncate',()=>{
 const snap=structuredClone(base.archive_snapshot)
 snap.group.steps[0].notes='L1: 0:55 | 1:50 | 2:45 | 3:40 | 4:35'
 const w=buildIntervalsWorkout(snap,base.title)
 assert.equal(w.steps[1].prompt,'L1: 0:55|1:50|2:45|3:40|4:35')
 assert.match(w.steps[1].line,/Press lap \(L1: 0:55\|1:50\|2:45\|3:40\|4:35\)/)
 assert.doesNotMatch(w.steps[1].line,/ \| /)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {QUALITY_SESSION,proposeStandaloneQuality} from '../src/lib/qualityWorkout.mjs'
import {buildCoachStructuredSnapshot,coachWorkoutDuration,coachWorkoutAllowed} from '../supabase/functions/_shared/coach-structured-workout.mjs'
import {buildIntervalsWorkout,buildIntervalsEvent,validateStoredIntervalsWorkout} from '../supabase/functions/_shared/intervals-workout.mjs'
import {quickCoachAction} from '../src/lib/calendarQuickAccept.mjs'
import {makePlanSnapshot} from '../src/lib/trainingHistory.mjs'
const today='2026-11-23'
const run=(id,date,rpe=30)=>({activity_id:id,start_time_local:date+'T09:00:00',sport_type:'running',duration_s:2400,distance_m:6000,rpe_raw:rpe})
const easy=(date)=>({date,kind:'easy',sport:'running',title:'Locker',minutes:40,reason:'Locker',approvable:true,intensityIntent:'low'})
const days=[easy(today),easy('2026-11-25'),easy('2026-11-27')]
const fixture=()=>({today,boards:[{start:'2026-11-16',activities:[run(1,'2026-11-18'),run(2,'2026-11-21')],manual:[]}],plans:[],roadmap:[{start:today,qualityOptions:1}],budget:{target:{low:20,high:35},paceSeconds:380,actualKm:0,forecastKm:30},polarized:{status:'easy-first',qualityDay:null},volumeStatus:'progress'})
const snap=()=>buildCoachStructuredSnapshot({kind:'intervals',minutes:36,title:QUALITY_SESSION.title,startTime:'18:00'})
test('one standalone quality slot replaces an open easy run without increasing time; review required',()=>{
 const r=proposeStandaloneQuality(days,fixture())
 assert.equal(r.date,today);assert.equal(r.days[0].kind,'intervals');assert.equal(r.days[0].minutes,36)
 assert.equal(r.days[1],days[1]);assert.equal(days[0].kind,'easy')
 assert.equal(quickCoachAction({days:r.days},today,today),'choose')
})
test('no quality in protected phase, with recent hard load, a club quality option, saved intent or weak evidence',()=>{
 for(const change of [{protectedPhase:true},{volumeStatus:'maintain'},{polarized:{status:'optional-hard',qualityDay:'2026-11-28'}},{budget:{target:null}},{roadmap:[{start:today,qualityOptions:0}]},{boards:[]},{boards:[{activities:[run(1,'2026-11-21',80)]}]},{plans:[{training_date:'2026-11-24',state:'draft',archive_snapshot:{sourceKind:'coach',coachKind:'intervals'}}]}])assert.equal(proposeStandaloneQuality(days,{...fixture(),...change}).date,null)
 const blocked=[...days,{date:'2026-11-24',kind:'chosen',selectedGroup:{title:'ORC Track'}}]
 assert.equal(proposeStandaloneQuality(blocked,fixture()).date,null)
})
test('structured interval workout is exactly 36 minutes, 4 efforts and 3 recoveries, no fake pace',()=>{
 const s=snap();assert.equal(coachWorkoutDuration(s),2160)
 const w=buildIntervalsWorkout(s,s.title)
 assert.equal(w.stepCount,9);assert.equal(w.steps.reduce((n,x)=>n+x.durationSeconds,0),2160)
 assert.equal((w.description.match(/intensity=interval/g)||[]).length,4)
 assert.equal((w.description.match(/intensity=recovery/g)||[]).length,3)
 assert.ok(w.steps.every(x=>x.mode==='time'&&x.paceSecondsPerKm===null))
 const e=buildIntervalsEvent({id:'01234567-89ab-4cde-8abc-1234567890ab',training_date:today,title:s.title,archive_snapshot:s})
 const stored={...e,moving_time:2160,distance:0,workout_doc:{steps:w.steps.map(x=>({duration:x.durationSeconds,until_lap_press:false}))}}
 assert.deepEqual(validateStoredIntervalsWorkout(stored,s,e),{ok:true,reason:'parsed'})
 const bad=structuredClone(s);bad.group.steps[0].intensity='active'
 assert.equal(coachWorkoutDuration(bad),null)
 assert.equal(buildCoachStructuredSnapshot({kind:'intervals',minutes:60,title:'X',startTime:'18:00'}),null)
 assert.equal(coachWorkoutAllowed({illness_state:'returning',blocked_periods:[]},'intervals',today),false)
})
test('archive counts known duration but never estimates quality km from easy pace',()=>{
 const budget={start:today,phaseLabel:'Aufbau',target:{low:20,high:35},paceSeconds:380,proposedParts:[]}
 const s=makePlanSnapshot({today,budget,plans:[{training_date:today,sport:'running',title:'Intervalle',state:'draft',archive_snapshot:snap()}]})
 assert.equal(s.entries[0].minutes,36);assert.equal(s.entries[0].km,null)
 const p=makePlanSnapshot({today,budget,days:proposeStandaloneQuality(days,fixture()).days})
 assert.equal(p.entries[0].minutes,36);assert.equal(p.entries[0].km,null)
})
test('all three write gates use canonical fresh evidence; no direct publish path',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const plan=read('supabase/functions/garmin-training-plan/index.ts'),bridge=read('supabase/functions/garmin-intervals/index.ts'),guard=read('supabase/functions/_shared/quality-guard.ts')
 assert.match(plan,/input.kind==='intervals'&&!await qualityStillAllowed/)
 assert.match(plan,/source.coachKind==='intervals'&&!await qualityStillAllowed/)
 assert.match(bridge,/plan.archive_snapshot.coachKind==='intervals'&&!await qualityStillAllowed/)
 assert.match(guard,/readArchiveCoachInput\(db,userId,today\)/)
 assert.match(guard,/p.id!==excludeId/)
 assert.match(guard,/d.qualityIntent==='candidate'/)
 assert.doesNotMatch(guard,/\.update\(|\.insert\(|\.upsert\(/)
})

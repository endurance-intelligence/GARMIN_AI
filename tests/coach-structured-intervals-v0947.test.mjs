import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 buildCoachStructuredSnapshot,coachWorkoutAllowed,coachWorkoutDuration
} from '../supabase/functions/_shared/coach-structured-workout.mjs'
import {
 buildIntervalsWorkout,buildIntervalsEvent,validateStoredIntervalsWorkout
} from '../supabase/functions/_shared/intervals-workout.mjs'
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const make=(kind='easy',minutes=35,time='07:30')=>buildCoachStructuredSnapshot({
 kind,minutes,title:'Lockerer Lauf',startTime:time
})
const plan=(snapshot)=>({id:'01234567-89ab-4cde-8abc-1234567890ab',
 training_date:'2026-11-14',title:'Lockerer Lauf',archive_snapshot:snapshot})
test('Coach easy workout is 3 ACTUAL timed sections, not manual LAP estimates',()=>{
 const snap=make('easy',35)
 assert.equal(coachWorkoutDuration(snap),2100)
 assert.deepEqual([
  snap.warmup.durationSeconds,snap.group.steps[0].durationSeconds,snap.cooldown.durationSeconds
 ],[300,1500,300])
 const w=buildIntervalsWorkout(snap,'Lockerer Lauf')
 assert.equal(w.stepCount,3)
 assert.match(w.description,/- EINLAUFEN 5m intensity=warmup/)
 assert.match(w.description,/- LAUF 25m intensity=active/)
 assert.match(w.description,/- AUSLAUFEN 5m intensity=cooldown/)
 assert.doesNotMatch(w.description,/Press lap|\b(?:Z2|\d+:\d+\/km|HR|bpm|mtr)\b/i)
 assert.ok(w.steps.every(s=>s.mode==='time'&&s.paceSecondsPerKm===null))
 assert.equal(w.steps.reduce((n,s)=>n+s.durationSeconds,0),2100)
})
test('Explicit selected time survives event serialization; archive workouts keep existing defaults',()=>{
 const x=buildIntervalsEvent(plan(make('easy',35,'07:30')))
 assert.equal(x.start_date_local,'2026-11-14T07:30:00')
 const archive=make('easy',35)
 delete archive.startTime
 assert.equal(buildIntervalsEvent(plan(archive)).start_date_local,'2026-11-14T09:00:00')
})
test('Intervals confirmation verifies real timed steps, no LAP and correct total',()=>{
 const snapshot=make('easy',35)
 const e=buildIntervalsEvent(plan(snapshot))
 const stored={...e,id:15300,moving_time:2100,distance:0,workout_doc:{
  steps:[{duration:300,until_lap_press:false},
   {duration:1500,until_lap_press:false},{duration:300,until_lap_press:false}]}}
 assert.deepEqual(validateStoredIntervalsWorkout(stored,snapshot,e),{ok:true,reason:'parsed'})
 const badLap=structuredClone(stored)
 badLap.workout_doc.steps[1].until_lap_press=true
 assert.match(validateStoredIntervalsWorkout(badLap,snapshot,e).reason,/LAP/)
 const badDuration=structuredClone(stored)
 badDuration.workout_doc.steps[1].duration=900
 assert.match(validateStoredIntervalsWorkout(badDuration,snapshot,e).reason,/Timed step/)
 const badTotal=structuredClone(stored)
 badTotal.moving_time=7500
 assert.match(validateStoredIntervalsWorkout(badTotal,snapshot,e).reason,/Coach workout duration/)
})
test('Return run does not exceed 30 minutes, and no synthetic pace/HR permitted',()=>{
 const snap=make('return_easy',15,'18:00')
 assert.equal(coachWorkoutDuration(snap),900)
 assert.equal(snap.group.steps[0].paceSecondsPerKm,null)
 assert.equal(make('return_easy',60),null)
 assert.equal(make('easy',10),null)
 assert.equal(make('long',200),null)
 assert.equal(make('easy',30,'03:00'),null)
 assert.equal(make('easy',30,'xx:00'),null)
 assert.equal(make('interval',30),null)
})
test('Illness, returning and blocked dates take priority over Coach approval and publishing',()=>{
 const base={illness_state:'well',blocked_periods:[],return_started_on:null}
 assert.equal(coachWorkoutAllowed(base,'easy','2026-11-14'),true)
 assert.equal(coachWorkoutAllowed(base,'return_easy','2026-11-14'),false)
 assert.equal(coachWorkoutAllowed({...base,illness_state:'sick'},'easy','2026-11-14'),false)
 assert.equal(coachWorkoutAllowed({...base,illness_state:'returning'},'easy','2026-11-14'),false)
 assert.equal(coachWorkoutAllowed({...base,illness_state:'returning'},'return_easy','2026-11-14'),true)
 assert.equal(coachWorkoutAllowed({...base,blocked_periods:[
  {start:'2026-11-13',end:'2026-11-17',reason:'vacation'}]},'easy','2026-11-14'),false)
 assert.equal(coachWorkoutAllowed({...base,return_started_on:'2026-11-08'},'long','2026-11-14'),false)
})
test('Only authenticated owner may create structured drafts; approvals and remote sends remain separate',()=>{
 const planSvc=src('supabase/functions/garmin-training-plan/index.ts')
 const bridge=src('supabase/functions/garmin-intervals/index.ts')
 const coach=src('src/components/CoachSevenDay.tsx')
 const calendar=src('src/pages/CalendarPage.tsx')
 assert.match(planSvc,/auth\.auth\.getUser\(match\[1\]\)/)
 assert.match(planSvc,/user\.email_confirmed_at/)
 assert.match(planSvc,/input\.action==='create_coach_workout'/)
 assert.match(planSvc,/coachWorkoutAllowed\(context,input\.kind,input\.date\)/)
 assert.match(planSvc,/state:'draft',archive_group:snapshot\.group\.name,archive_snapshot:snapshot/)
 assert.match(planSvc,/if\(approving\)/)
 assert.match(bridge,/not\('archive_snapshot','is',null\)/)
 assert.match(bridge,/coachWorkoutDuration\(plan\.archive_snapshot\)/)
 assert.match(bridge,/coachWorkoutAllowed\(context/)
 assert.match(bridge,/plan\.state!=='pending'\|\|!plan\.approved_at/)
 assert.match(coach,/action:'create_coach_workout'/)
 assert.match(coach,/Startzeit in Intervals\.icu/)
 assert.match(calendar,/action:'approve'/)
 assert.match(calendar,/action:'publish'/)
 assert.doesNotMatch(coach,/garmin-intervals.*action:'publish'/)
})

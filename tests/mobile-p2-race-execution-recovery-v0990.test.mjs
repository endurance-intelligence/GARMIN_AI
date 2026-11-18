import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {assessRaceOutcome} from '../src/lib/raceOutcome.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const input=(diff={})=>({
 distanceKm:112,courseMode:'laps',loopKm:6,movingMinutes:42,
 regularPauseMinutes:3,longStopEvery:3,longStopMinutes:10,
 paceSeconds:null,targetHours:15,carbsGPerHour:70,
 fluidMlPerHour:500,sodiumMgPerHour:450,...diff
})
test('112km ultra 6km laps and long breaks map onto planned finish (not prediction)',()=>{
 const r=buildRaceExecution(input())
 assert.equal(r.status,'ready')
 assert.equal(r.estimate.totalMinutes,898)
 assert.equal(r.target.minutes,900)
 assert.equal(r.target.remaining,2)
 assert.equal(r.target.status,'within')
 assert.equal(r.checkpoints.length,19)
 assert.equal(r.checkpoints[0].arrivalMinutes,42)
 assert.equal(r.checkpoints[0].pauseMinutes,3)
 assert.equal(r.checkpoints[0].departureMinutes,45)
 assert.equal(r.checkpoints[2].arrivalMinutes,132)
 assert.equal(r.checkpoints[2].pauseMinutes,13)
 assert.equal(r.checkpoints[2].departureMinutes,145)
 assert.equal(r.checkpoints[2].longBreakMinutes,10)
 assert.equal(r.checkpoints[18].distanceKm,112)
 assert.equal(r.checkpoints[18].legDistanceKm,4)
 assert.equal(r.checkpoints[18].finish,true)
 assert.equal(r.checkpoints[18].pauseMinutes,0)
 assert.equal(r.checkpoints[18].arrivalMinutes,898)
 assert.equal(r.checkpoints[18].departureMinutes,898)
 assert.match(r.warning,/Letzte Runde/)
})
test('nutrition quantities use planned total time including stops, not imaginary meal completion',()=>{
 const r=buildRaceExecution(input())
 assert.equal(r.nutrition.carbsG,1048)
 assert.equal(r.nutrition.fluidMl,7483)
 assert.equal(r.nutrition.sodiumMg,6735)
 assert.equal(r.nutrition.hours,15)
 const unknown=buildRaceExecution(input({
  carbsGPerHour:null,fluidMlPerHour:null,sodiumMgPerHour:null
 }))
 assert.equal(unknown.nutrition,null)
})
test('plan slower than desired goal clearly shows negative buffer, no claims of finish certainty',()=>{
 const r=buildRaceExecution(input({targetHours:14}))
 assert.equal(r.target.remaining,-58)
 assert.equal(r.target.status,'over')
 assert.match(r.target.text,/über deinem Zeitlimit/)
 assert.equal(buildRaceExecution(input({targetHours:null})).target,null)
})
test('point-to-point: no invented laps or rest stations; all distance is one segment',()=>{
 const r=buildRaceExecution(input({distanceKm:31.1,courseMode:'point_to_point',
  loopKm:null,movingMinutes:null,regularPauseMinutes:null,
  longStopEvery:null,longStopMinutes:null,paceSeconds:360,targetHours:3.5}))
 assert.equal(r.status,'ready')
 assert.equal(r.checkpoints.length,1)
 assert.equal(r.checkpoints[0].distanceKm,31.1)
 assert.equal(r.checkpoints[0].pauseMinutes,0)
 assert.equal(r.estimate.totalMinutes,187)
})
test('no positive race advice without meaningful inputs',()=>{
 const r=buildRaceExecution(input({loopKm:null,movingMinutes:null}))
 assert.equal(r.status,'missing')
 assert.equal(r.nutrition,null)
 assert.equal(r.target,null)
 assert.equal(r.checkpoints.length,0)
})
test('race result only when one Garmin run matches race DATE and realistic distance',()=>{
 const board={activities:[
  {activity_id:'a',start_time_local:'2026-11-21 10:00:00',sport_type:'running',
   distance_m:111800,duration_s:54000},
  {activity_id:'b',start_time_local:'2026-11-22 08:00:00',sport_type:'running',
   distance_m:112000,duration_s:53000},
  {activity_id:'c',start_time_local:'2026-11-21 14:00:00',sport_type:'cycling',
   distance_m:111800,duration_s:28000}
 ]}
 const r=assessRaceOutcome({raceDate:'2026-11-21',raceDistanceKm:112,
  plannedMinutes:898,board,checks:[{raceDate:'2026-11-21',reportedOn:'2026-11-22',
   fatigue:9,soreness:8,warning:false}]})
 assert.equal(r.matchStatus,'unique')
 assert.equal(r.actualKm,111.8)
 assert.equal(r.actualMinutes,900)
 assert.equal(r.planDeltaMinutes,2)
 assert.equal(r.raceCheck.fatigue,9)
 assert.match(r.caveat,/nicht belegen/)
})
test('ambiguous or non-matching runs must never be misidentified as official race result',()=>{
 const dup={activities:[
  {activity_id:'a',start_time_local:'2026-11-21 10:00:00',
   sport_type:'running',distance_m:112000,duration_s:50000},
  {activity_id:'b',start_time_local:'2026-11-21 10:00:00',
   sport_type:'running',distance_m:111000,duration_s:49900}
 ]}
 const x=assessRaceOutcome({raceDate:'2026-11-21',raceDistanceKm:112,
  plannedMinutes:900,board:dup})
 assert.equal(x.matchStatus,'ambiguous')
 assert.equal(x.actualMinutes,null)
 const y=assessRaceOutcome({raceDate:'2026-11-21',raceDistanceKm:112,
  plannedMinutes:900,board:{activities:[{...dup.activities[0],distance_m:null}]}})
 assert.equal(y.matchStatus,'unavailable')
 assert.equal(y.planDeltaMinutes,null)
})
test('race recap retains only latest athlete-entered recovery check for same event',()=>{
 const r=assessRaceOutcome({raceDate:'2026-11-21',raceDistanceKm:112,
  plannedMinutes:null,board:{activities:[]},checks:[
   {raceDate:'2026-11-21',reportedOn:'2026-11-22',fatigue:8,soreness:8,warning:false},
   {raceDate:'2026-11-21',reportedOn:'2026-11-23',fatigue:6,soreness:7,warning:true},
   {raceDate:'2026-10-01',reportedOn:'2026-11-25',fatigue:10,soreness:10,warning:false}
  ]})
 assert.equal(r.raceCheck.fatigue,6)
 assert.equal(r.raceCheck.warning,true)
})
test('Race Prep connects editable strategy to execution, Garmin outcome and Coach recovery',()=>{
 const ui=read('src/components/RaceStrategyCard.tsx')
 const race=read('src/pages/RacePage.tsx')
 const execution=read('src/components/RaceExecutionCard.tsx')
 const outcome=read('src/components/RaceAfterActionCard.tsx')
 const engine=read('src/lib/raceExecution.mjs')
 assert.match(ui,/<RaceExecutionCard saved=\{saved\}/)
 assert.match(ui,/<RaceAfterActionCard goal=\{goal\}/)
 assert.match(ui,/targetHours:goal\.target_hours/)
 assert.match(ui,/carbsGPerHour:get\(draft\.carbs\)/)
 assert.match(race,/onCoach=\{\(\)=>onGo\('home'\)\}/)
 assert.match(execution,/Runde/)
 assert.match(execution,/DEINEN STUNDENWERTEN/)
 assert.match(outcome,/garmin-week-board\?start=/)
 assert.match(outcome,/garmin-coach-context/)
 assert.match(outcome,/Erholungs-Barometer im Coach/)
 assert.doesNotMatch(outcome,/\.upsert\(|\.insert\(|service_role|publishWorkout/)
 assert.doesNotMatch(engine,/fetch\(|Math\.random\(|fitnessPercent/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {estimateRaceStrategy} from '../src/lib/raceStrategyMath.mjs'
import {estimateRaceBudget,buildRaceLapCheckpoints,buildRaceReview} from '../src/lib/raceExecution.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const race={raceDate:'2026-11-21',raceName:'Heartbeat Ultra Fulda',distanceKm:112}
const input={
 distanceKm:112,courseMode:'laps',loopKm:6,movingMinutes:42,
 regularPauseMinutes:3,longStopEvery:3,longStopMinutes:10,paceSeconds:null
}
const goalStrategy={
 race_date:'2026-11-21',race_name:'Heartbeat Ultra Fulda',race_distance_km:112,
 goal_target_hours:15,course_mode:'laps',loop_km:6,moving_minutes_per_loop:42,
 pause_minutes_per_loop:3,long_stop_every:3,long_stop_minutes:10,
 carbs_g_per_hour:70,fluid_ml_per_hour:500,sodium_mg_per_hour:700
}
const act=(id,date,km,duration,sport='running')=>({
 activity_id:id,start_time_local:date+' 06:00:00',sport_type:sport,
 distance_m:km*1000,duration_s:duration*60
})
const actualBoard=(rows)=>({start:'2026-11-16',activities:rows,manual:[]})
const context=(fatigue=8,warning=false)=>({
 race_recovery_checks:[{raceDate:'2026-11-21',raceName:'Heartbeat Ultra Fulda',
  reportedOn:'2026-11-22',fatigue,soreness:6,warning}]
})
test('112 km / 15 h: exact planned moving, stops, two-minute buffer and full-race nutrition',()=>{
 const plan=estimateRaceStrategy(input)
 assert.equal(plan.totalMinutes,898)
 const budget=estimateRaceBudget({distanceKm:112,targetHours:15,calculation:plan,
  carbsPerHour:70,fluidPerHour:500,sodiumPerHour:700})
 assert.equal(budget.marginMinutes,2)
 assert.equal(budget.estimatedMovingPaceSeconds,420)
 assert.equal(budget.plannedCarbsGrams,1048)
 assert.equal(budget.plannedFluidMl,7483)
 assert.equal(budget.plannedSodiumMg,10477)
 assert.equal(budget.completeFuel,true)
 assert.match(budget.note,/keine.*Ernährungs-Empfehlung|Keine Trink- oder Ernährungs-Empfehlung/i)
})
test('each lap and departure time count regular plus extra every-third-lap stop',()=>{
 const laps=buildRaceLapCheckpoints(input)
 assert.equal(laps.length,19)
 assert.deepEqual(laps[0],{
  lap:1,km:6,arrivalMinutes:42,stopMinutes:3,departureMinutes:45,last:false})
 assert.equal(laps[2].km,18)
 assert.equal(laps[2].arrivalMinutes,132)
 assert.equal(laps[2].stopMinutes,13)
 assert.equal(laps[2].departureMinutes,145)
 assert.equal(laps.at(-1).km,112)
 assert.equal(laps.at(-1).stopMinutes,0)
 assert.equal(laps.at(-1).departureMinutes,898)
 assert.equal(laps.filter(x=>x.stopMinutes===13).length,6)
})
test('point-to-point deficit uses known pace, never assumes extra intervals',()=>{
 const plan=estimateRaceStrategy({...input,distanceKm:31.1,courseMode:'point_to_point',
  loopKm:null,movingMinutes:null,paceSeconds:360})
 const budget=estimateRaceBudget({distanceKm:31.1,targetHours:3,calculation:plan,
  carbsPerHour:null,fluidPerHour:null,sodiumPerHour:null})
 assert.equal(plan.totalMinutes,187)
 assert.equal(budget.marginMinutes,-7)
 assert.equal(budget.estimatedMovingPaceSeconds,361) // 187 rounded minutes / 31.1 km
 assert.equal(budget.plannedCarbsGrams,null)
 assert.equal(budget.plannedFluidMl,null)
 assert.equal(budget.plannedSodiumMg,null)
 assert.equal(budget.completeFuel,false)
})
test('no moving time produces no estimated nutrition or made-up pacing',()=>{
 const b=estimateRaceBudget({distanceKm:112,targetHours:15,calculation:null,
  carbsPerHour:70,fluidPerHour:500,sodiumPerHour:700})
 assert.equal(b.totalMinutes,null)
 assert.equal(b.marginMinutes,null)
 assert.equal(b.plannedFluidMl,null)
 assert.equal(b.estimatedMovingPaceSeconds,null)
 assert.deepEqual(buildRaceLapCheckpoints({...input,loopKm:null}),[])
})
test('before the race no automatic finish, verdict or after-race recovery',()=>{
 const p=buildRaceReview({today:'2026-11-17',race,strategy:goalStrategy,
  board:actualBoard([act('future','2026-11-21',112,900)])})
 assert.equal(p.status,'upcoming')
 assert.equal(p.garmin,null)
 assert.equal(p.recovery,null)
})
test('uniquely matched Garmin race and EXISTING recovery check are linked, not duplicated',()=>{
 const board=actualBoard([
  act('race','2026-11-21',111.8,856),
  act('warmup','2026-11-21',2,20),
  act('other','2026-11-22',112,850),
  act('ride','2026-11-21',112,900,'cycling')])
 const p=buildRaceReview({today:'2026-11-23',race,
  strategy:goalStrategy,board,context:context(8)})
 assert.equal(p.status,'matched')
 assert.equal(p.plan.totalMinutes,898)
 assert.equal(p.garmin.activityId,'race')
 assert.equal(p.garmin.recordedKm,111.8)
 assert.equal(p.garmin.activityMinutes,856)
 assert.equal(p.recovery.fatigue,8)
 assert.match(p.following,/weitere Ruhe/)
 assert.match(p.timingNote,/offizielles Rennergebnis/)
 assert.match(p.fuelingNote,/nicht.*konsumiert|nicht zuverlässig/)
 assert.equal(Object.hasOwn(p,'actualCarbsGrams'),false)
})
test('multiple similar Garmin activities fail closed; a nonmatching run is not DNF',()=>{
 const ambiguous=buildRaceReview({today:'2026-11-23',race,strategy:goalStrategy,
  board:actualBoard([act('a','2026-11-21',112,850),act('b','2026-11-21',105,820)])})
 assert.equal(ambiguous.status,'ambiguous')
 assert.equal(ambiguous.garmin,null)
 const none=buildRaceReview({today:'2026-11-23',race,
  board:actualBoard([act('short','2026-11-21',38,270)])})
 assert.equal(none.status,'not-matched')
 assert.match(none.message,/nicht erraten/)
 assert.doesNotMatch(none.message,/nicht gestartet|nicht gelaufen|DNF/)
 const unavailable=buildRaceReview({today:'2026-11-23',race,board:null})
 assert.equal(unavailable.status,'no-garmin-week')
 assert.equal(unavailable.garmin,null)
})
test('own warning signs always beat encouraging finish evidence',()=>{
 const report=buildRaceReview({today:'2026-11-23',race,
  board:actualBoard([act('race','2026-11-21',112,860)]),
  context:context(2,true)})
 assert.equal(report.garmin.recordedKm,112)
 assert.equal(report.recovery.warning,true)
 assert.match(report.following,/medizinisch abklären/)
})
test('race strategy preview shows meaningful inputs and cumulative split schedule',()=>{
 const ui=read('src/components/RaceStrategyCard.tsx')
 const css=read('src/styles/race-strategy.css')
 assert.match(ui,/buildRaceLapCheckpoints\(/)
 assert.match(ui,/estimateRaceBudget\(/)
 assert.match(ui,/Zielzeit inklusive Pausen/)
 assert.match(ui,/Rechnerischer Zeitpuffer/)
 assert.match(ui,/Kohlenhydrate gesamt/)
 assert.match(ui,/Getränke gesamt/)
 assert.match(ui,/Natrium gesamt/)
 assert.match(ui,/Rundenzeiten &amp; Stopps ansehen/)
 assert.match(ui,/race_distance_km:Number\(goal\.distance_km\)/)
 assert.match(ui,/goal_target_hours:goal\.target_hours/)
 assert.match(css,/\.rsp-checkpoint-row/)
 assert.match(css,/\.rsp-supply-budget/)
})
test('after-race report reuses original recovery barometer and can show archived plans',()=>{
 const ui=read('src/components/RaceReviewCard.tsx')
 const page=read('src/pages/RacePage.tsx')
 const sql=read('supabase/migrations/20261117170000_race_plan_goal_snapshot_v0990.sql')
 assert.ok(page.includes('<RaceReviewCard active={active} onCoach={()=>onGo(\\'home\\')}/>'))
 assert.match(ui,/garmin-coach-context/)
 assert.match(ui,/garmin-week-board\?start=/)
 assert.match(ui,/garmin_race_strategy/)
 assert.match(ui,/goal_target_hours/)
 assert.match(ui,/race_distance_km/)
 assert.match(ui,/fromArchive/)
 assert.match(ui,/Keine zusätzlichen Formulare/)
 assert.match(ui,/Nach dem Rennen verbindet/)
 assert.match(ui,/Zum bestehenden Erholungs-Check im Coach/)
 assert.doesNotMatch(ui,/record_race_recovery|\.upsert\(|\.insert\(|onSave\(|<textarea/)
 assert.match(sql,/add column if not exists race_distance_km/)
 assert.match(sql,/add column if not exists goal_target_hours/)
 assert.match(sql,/strategy\.user_id=goal\.user_id/)
 assert.match(sql,/RLS policies remain unchanged/)
 assert.match(read('src/styles/race-review.css'),/@media\(max-width:540px\)/)
})

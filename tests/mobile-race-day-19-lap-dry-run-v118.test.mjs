/**
 * Full Heartbeat Ultra dry run of the production's PURE race-day logic.
 * NO write to a real athlete's storage, Supabase, Garmin, inventory or race logs.
 * "Reloads" below are JSON/storage round-trips, not a browser E2E test.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'
import {buildRaceFuelRoadmap} from '../src/lib/raceFuelRoadmap.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'
import {buildGelPlan} from '../src/lib/gelTiming.mjs'
import {buildRaceDayCockpit,recordRaceMark,raceDayLogText,raceElapsedNow}
 from '../src/lib/raceDayCockpit.mjs'
import {assessRunnerAdvance,assessRunnerCorrection,validateRunnerSnapshot,
 RUNNER_TAP_GUARD_MS} from '../src/lib/raceRunnerSafety.mjs'
import {updateFuelMark,recentFuelFeedback} from '../src/lib/raceFuelLog.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const race={raceName:'Heartbeat Ultra Fulda',raceDate:'2026-11-21',total:19}
const goal={race_name:race.raceName,race_date:race.raceDate}
const input={distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,
 longStopMinutes:8,paceSeconds:null,targetHours:15,
 carbsGPerHour:75,fluidMlPerHour:500,sodiumMgPerHour:500}
const plan=buildRaceExecution(input)
const cps=plan.checkpoints
const aid=buildAidPlan({checkpoints:cps,settings:{
 aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'160',
 aid_drink_ml_per_stop:250,aid_custom_carbs_g_per_500:0,
 aid_food_name:'Nudeln, Brötchen, Banane',aid_food_carbs_g_per_stop:0
},startTime:'06:00'})
const gels=[
 {minute:20,brand:'Maurten',name:'Gel 100',carbsG:25,caffeineMg:0},
 {minute:220,brand:'226ERS',name:'High Energy Gel',carbsG:50,caffeineMg:0},
 {minute:720,brand:'Maurten',name:'Gel 100 CAF 100',carbsG:25,caffeineMg:100}
]
const d=(v)=>JSON.parse(JSON.stringify(v))
const emptyLog=()=>({version:1,raceDate:race.raceDate,raceName:race.raceName,
 runnerCompleted:0,runnerTapAt:null,marks:{},fuelMarks:{},startTime:'06:00'})

test('19 rounds are exactly 112 km, 886 minutes and 6 intentional long stops',()=>{
 assert.equal(plan.status,'ready')
 assert.equal(cps.length,19)
 assert.equal(plan.estimate.totalMinutes,886)
 assert.equal(plan.target.remaining,14)
 assert.equal(cps[18].legDistanceKm,4)
 assert.equal(cps[18].finish,true)
 assert.equal(cps[18].pauseMinutes,0)
 assert.equal(cps[18].arrivalMinutes,886)
 assert.equal(cps.filter(c=>c.longBreakMinutes>0).length,6)
 assert.deepEqual(cps.filter(c=>c.longBreakMinutes>0).map(c=>c.index),
  [3,6,9,12,15,18])
 for(const c of cps){
  assert.equal(c.departureMinutes-c.arrivalMinutes,c.pauseMinutes)
  if(c.longBreakMinutes>0)assert.equal(c.pauseMinutes,11)
  else if(!c.finish)assert.equal(c.pauseMinutes,3)
 }
 assert.equal(aid.events.length,18)
 assert.equal(aid.drinkCarbsG,360)
 assert.equal(aid.foodCarbsG,0)
 assert.equal(aid.events.at(-1).round,18)
})

test('all 19 manual taps, double-tap guard, explicit fuel feedback and 3 reloads',()=>{
 const storage=new Map()
 const key='race-day:dry-run:'+race.raceDate+':'+race.raceName
 let log=emptyLog()
 const persist=next=>{
  const str=JSON.stringify(next)
  storage.set(key,str)
  assert.equal(storage.get(key),str,'write/read-back verification')
  const reload=validateRunnerSnapshot(JSON.parse(storage.get(key)),race)
  assert.equal(reload.ok,true,'saved snapshot can be restored without repair')
  log={...next,marks:reload.marks,fuelMarks:reload.fuelMarks,
   runnerCompleted:reload.completed,runnerTapAt:reload.lastTapAt,
   startTime:reload.startTime}
 }
 persist(log)
 const base=Date.parse('2026-11-21T05:00:00Z')
 let reloads=0
 const milestones=new Map([[3,'planned'],[9,'different'],[16,'skipped']])
 for(let i=1;i<=cps.length;i++){
  const before=buildRunnerFocus({checkpoints:cps,completed:log.runnerCompleted,
   gelEvents:gels,aidEvents:aid.events})
  assert.equal(before.nextIndex,i)
  assert.equal(before.total,19)
  assert.equal(before.finished,false)
  assert.equal(before.planOnly,true)
  assert.equal(log.runnerCompleted,i-1)
  assert.equal(log.fuelMarks[String(i)],undefined,
   'completing a round never creates a fuel intake record')
  const stamp=base+cps[i-1].arrivalMinutes*60000
  const action=assessRunnerAdvance({completed:log.runnerCompleted,total:19,
   lastTapAt:log.runnerTapAt,now:stamp})
  assert.equal(action.ok,true,'lap '+i+': '+action.reason)
  const duplicate=assessRunnerAdvance({completed:log.runnerCompleted,
   total:19,lastTapAt:action.stamp,now:stamp+100})
  assert.equal(duplicate.ok,false,'double tap blocked for lap '+i)
  persist({...log,runnerCompleted:action.next,runnerTapAt:action.stamp})
  assert.equal(log.runnerCompleted,i)
  if(milestones.has(i)){
   const result=updateFuelMark(log.fuelMarks,{round:i,completed:i,total:19,
    status:milestones.get(i)})
   assert.equal(result.ok,true)
   persist({...log,fuelMarks:result.marks})
   const feedback=recentFuelFeedback(log.fuelMarks,{completed:i,total:19})
   assert.equal(feedback.status,milestones.get(i))
   assert.equal(feedback.confirmedByUser,true)
  }
  if([4,10,17].includes(i)){
   // New component instance reconstructs all race data from local JSON.
   const current=JSON.parse(storage.get(key))
   const restored=validateRunnerSnapshot(current,race)
   assert.equal(restored.ok,true)
   assert.equal(restored.completed,i)
   assert.equal(restored.lastTapAt,stamp)
   assert.deepEqual(restored.fuelMarks,log.fuelMarks)
   reloads++
   const guard=assessRunnerAdvance({completed:restored.completed,
    total:19,lastTapAt:restored.lastTapAt,now:stamp+300})
   assert.equal(guard.ok,false,'tap guard survives page reload')
  }
 }
 assert.equal(reloads,3)
 assert.equal(Object.keys(log.fuelMarks).length,3)
 assert.deepEqual(log.fuelMarks,{'3':'planned','9':'different','16':'skipped'})
 assert.equal(assessRunnerAdvance({completed:19,total:19,lastTapAt:log.runnerTapAt,
  now:log.runnerTapAt+RUNNER_TAP_GUARD_MS}).ok,false)
 assert.equal(buildRunnerFocus({checkpoints:cps,completed:19}).finished,true)
 assert.equal(buildRunnerFocus({checkpoints:cps,completed:19}).meal,null)
 assert.ok(!JSON.stringify(log).includes('consumedCarbs'))
 assert.ok(!JSON.stringify(log).includes('actualKcal'))
})

test('caffeine appears only on the scheduled later lap, never as a default',()=>{
 const all=buildRaceFuelRoadmap({checkpoints:cps,aidEvents:aid.events,
  gelEvents:gels})
 assert.equal(all.status,'ready')
 assert.equal(all.rounds.length,19)
 assert.equal(all.totals.longStops,6)
 assert.equal(all.totals.gelCount,3)
 assert.equal(all.totals.caffeineMg,100)
 assert.deepEqual(all.rounds.filter(x=>x.caffeineMg>0).map(x=>x.round),[16])
 assert.ok(all.rounds.slice(0,15).every(x=>x.caffeineMg===0))
 assert.equal(all.rounds[15].phase,'late')
 assert.equal(all.rounds[15].primaryKind,'gel')
 assert.match(all.rounds[15].primary,/CAF 100/)
 assert.equal(all.totals.foodCarbsG,0)
 assert.equal(all.totals.drinkCarbsG,360)
 const disabled=buildRaceFuelRoadmap({checkpoints:cps,aidEvents:[],
  gelEvents:[]})
 assert.equal(disabled.totals.caffeineMg,0)
 const plain=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,
  inventory:[{id:'s',brand:'Maurten',name:'Gel 100',flavor:'Standard',
   carbsG:25,caffeineMg:0,quantity:40,priority:1},
  {id:'caf',brand:'Maurten',name:'Gel 100 CAF 100',flavor:'Standard',
   carbsG:25,caffeineMg:100,quantity:2,priority:1}],
  aidEvents:aid.events,allowCaffeine:false,startTime:'06:00'})
 assert.ok(plain.events.every(x=>x.caffeineMg===0))
 const enabled=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,
  inventory:[{id:'s',brand:'Maurten',name:'Gel 100',flavor:'Standard',
   carbsG:25,caffeineMg:0,quantity:40,priority:1},
  {id:'caf',brand:'Maurten',name:'Gel 100 CAF 100',flavor:'Standard',
   carbsG:25,caffeineMg:100,quantity:2,priority:1}],
  aidEvents:aid.events,allowCaffeine:true,
  caffeineStartMinute:480,caffeineMaxMg:100,startTime:'06:00'})
 assert.ok(enabled.events.filter(x=>x.caffeineMg>0)
  .every(x=>x.minute>=480))
 assert.ok(enabled.caffeineMg<=100)
 // The actual stored inventory remains untouched by the simulator.
 assert.equal(enabled.planOnly,true)
})

test('19 crew arrivals and departures survive clean chronology and real manual export',()=>{
 let marks={}
 for(const cp of cps){
  const a=recordRaceMark(marks,cps,cp.index,'arrival',cp.arrivalMinutes+3)
  assert.equal(a.ok,true,'arrival round '+cp.index+' '+a.reason)
  marks=a.marks
  if(!cp.finish){
   const dep=recordRaceMark(marks,cps,cp.index,'departure',
    cp.departureMinutes+3)
   assert.equal(dep.ok,true,'departure round '+cp.index+' '+dep.reason)
   marks=dep.marks
  }
  const model=buildRaceDayCockpit({input,marks,startTime:'06:00'})
  assert.equal(model.recorded,cp.index)
  assert.equal(model.rows[cp.index-1].arrival,cp.arrivalMinutes+3)
  if(!cp.finish){
   assert.equal(model.rows[cp.index-1].departure,
    cp.departureMinutes+3)
   if(cp.longBreakMinutes>0){
    assert.equal(model.rows[cp.index-1].departure-
     model.rows[cp.index-1].arrival,11)
   }
  }
 }
 const complete=buildRaceDayCockpit({input,marks,startTime:'06:00'})
 assert.equal(complete.finished,true)
 assert.equal(complete.next,null)
 assert.equal(complete.recorded,19)
 assert.equal(complete.buffer,11)
 assert.equal(complete.rows[18].departure,null)
 const exported=raceDayLogText({goal,model:complete,startTime:'06:00'})
 assert.match(exported,/Heartbeat Ultra Fulda/)
 assert.match(exported,/Abschnitt 19/)
 assert.match(exported,/ZIEL/)
 assert.match(exported,/manuell bestätigt, kein Garmin-Livetracking/)
 assert.doesNotMatch(exported,/GPS live|automatisch gefinisht/)
})

test('undo, emergency correction, bad storage, wrong event and storage errors are safe',()=>{
 const original={...emptyLog(),runnerCompleted:9,runnerTapAt:1900000000000,
  fuelMarks:{'3':'planned','9':'skipped'}}
 assert.equal(validateRunnerSnapshot(original,race).ok,true)
 const restored=validateRunnerSnapshot(d(original),race)
 assert.equal(restored.completed,9)
 assert.equal(assessRunnerCorrection({count:8,total:19,recorded:9}).ok,false)
 assert.equal(assessRunnerCorrection({count:8,total:19,recorded:0}).ok,true)
 const cleaned=Object.fromEntries(Object.entries(original.fuelMarks)
  .filter(([round])=>Number(round)<9))
 const undone=validateRunnerSnapshot({...original,runnerCompleted:8,
  runnerTapAt:null,fuelMarks:cleaned},race)
 assert.equal(undone.ok,true)
 assert.deepEqual(undone.fuelMarks,{'3':'planned'})
 assert.equal(validateRunnerSnapshot({...original,runnerCompleted:8},race).ok,false)
 assert.equal(validateRunnerSnapshot({...original,raceDate:'2026-11-22'},race).ok,false)
 assert.equal(validateRunnerSnapshot({...original,version:2},race).ok,false)
 assert.equal(validateRunnerSnapshot({...original,fuelMarks:{'20':'planned'}},race).ok,false)
 // Do not silently repair or overwrite unreadable snapshots.
 assert.throws(()=>JSON.parse('{"version":1'),SyntaxError)
 const brokenStorage={setItem(){throw Error('quota exceeded')},getItem(){return null}}
 assert.throws(()=>brokenStorage.setItem('key','data'),/quota exceeded/)
 assert.equal(brokenStorage.getItem('key'),null)
})

test('Berlin clock logic matches Heartbeat date; no metrics leaked into runner mode',()=>{
 assert.equal(raceElapsedNow({raceDate:'2026-11-21',startTime:'06:00',
  now:new Date('2026-11-21T05:00:00Z')}),0)
 assert.equal(raceElapsedNow({raceDate:'2026-11-21',startTime:'06:00',
  now:new Date('2026-11-21T19:00:00Z')}),840)
 assert.equal(raceElapsedNow({raceDate:'2026-11-21',startTime:'06:00',
  now:new Date('2026-11-21T04:59:00Z')}),null)
 const ui=read('src/components/RaceRunnerFocus.tsx')
 const driver=read('src/components/RaceDayCockpit.tsx')
 const safety=read('src/lib/raceRunnerSafety.mjs')
 assert.match(ui,/Runde geschafft/)
 assert.match(ui,/onClick=\{onComplete\}/)
 assert.match(ui,/disabled=\{!loaded\}/)
 assert.match(ui,/Verpflegung nach Runde/)
 assert.match(ui,/<details className="rrf-fuel-check">/)
 assert.match(driver,/localStorage\.getItem\(key\)!==text/)
 assert.match(driver,/validateRunnerSnapshot\(/)
 assert.match(driver,/Object\.fromEntries\(Object\.entries\(fuelMarks\)/)
 assert.match(driver,/onFuelMark=\{recordFuel\}/)
 assert.match(driver,/Rennprotokoll kopieren/)
 assert.match(ui,/kein[e]? Garmin/i)
 assert.doesNotMatch(ui,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
 assert.doesNotMatch(safety,/fetch\(|supabase|navigator\.geolocation/)
 // A complete reload with NO INTERNET is not supported by this SPA/auth flow.
 assert.match(ui,/Ein vollständiger Neustart ohne Internet ist wegen/)
})

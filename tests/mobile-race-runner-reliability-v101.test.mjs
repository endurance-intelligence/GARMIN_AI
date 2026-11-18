import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessRunnerAdvance,assessRunnerCorrection,
 validateRunnerSnapshot,RUNNER_TAP_GUARD_MS} from '../src/lib/raceRunnerSafety.mjs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const goal={raceDate:'2026-11-21',raceName:'Heartbeat Ultra Fulda',total:19}
const stored=(runnerCompleted=0,runnerTapAt=null)=>({
 version:1,...goal,raceName:goal.raceName,runnerCompleted,runnerTapAt,marks:{},
 startTime:'06:00'
})
test('normal tap advances exactly one runner lap without calculating GPS distance',()=>{
 const r=assessRunnerAdvance({completed:10,total:19,lastTapAt:null,now:1795241000000})
 assert.deepEqual(r,{ok:true,next:11,stamp:1795241000000,reason:null})
 assert.equal(RUNNER_TAP_GUARD_MS,12000)
})
test('instant double tap is blocked even if React did not rerender yet',()=>{
 const first=assessRunnerAdvance({completed:10,total:19,now:1795241000000})
 assert.equal(first.ok,true)
 const duplicate=assessRunnerAdvance({completed:10,total:19,
  lastTapAt:first.stamp,now:first.stamp+200})
 assert.equal(duplicate.ok,false)
 assert.match(duplicate.reason,/zweiter Tipp/)
 const after=assessRunnerAdvance({completed:11,total:19,
  lastTapAt:first.stamp,now:first.stamp+RUNNER_TAP_GUARD_MS})
 assert.equal(after.ok,true)
 assert.equal(after.next,12)
})
test('repeat after browser restart remains blocked because stamp was saved',()=>{
 const now=1795241000000
 const snapshot=JSON.parse(JSON.stringify(stored(11,now)))
 const r=validateRunnerSnapshot(snapshot,goal)
 assert.equal(r.ok,true)
 assert.equal(r.completed,11)
 assert.equal(r.lastTapAt,now)
 assert.equal(assessRunnerAdvance({completed:r.completed,total:19,
  lastTapAt:r.lastTapAt,now:now+400}).ok,false)
})
test('all finished, corrupted counters, backwards clock and invalid stamps are never accepted',()=>{
 assert.equal(assessRunnerAdvance({completed:19,total:19,now:1795241000000}).ok,false)
 assert.equal(assessRunnerAdvance({completed:-1,total:19,now:1795241000000}).ok,false)
 assert.equal(assessRunnerAdvance({completed:20,total:19,now:1795241000000}).ok,false)
 assert.equal(assessRunnerAdvance({completed:5.5,total:19,now:1795241000000}).ok,false)
 assert.equal(assessRunnerAdvance({completed:11,total:19,
  lastTapAt:1795241000000,now:1795240999900}).ok,false)
 assert.equal(assessRunnerAdvance({completed:0,total:19,
  lastTapAt:-11,now:1795241000000}).ok,false)
})
test('legacy v1 local race log without runner tap timestamp is readable',()=>{
 const legacy=stored(8)
 delete legacy.runnerTapAt
 const restored=validateRunnerSnapshot(legacy,goal)
 assert.equal(restored.ok,true)
 assert.equal(restored.completed,8)
 assert.equal(restored.lastTapAt,null)
 const fresh=validateRunnerSnapshot(null,goal)
 assert.equal(fresh.completed,0)
 assert.equal(fresh.ok,true)
})
test('event mismatch, invalid mark sets, invalid round count trigger deliberate repair, never overwrite silently',()=>{
 assert.equal(validateRunnerSnapshot(stored(9),{...goal,raceName:'Other Race'}).ok,false)
 assert.equal(validateRunnerSnapshot(stored(20),goal).ok,false)
 assert.equal(validateRunnerSnapshot({...stored(8),marks:[]},goal).ok,false)
 assert.equal(validateRunnerSnapshot({...stored(8),runnerTapAt:-1},goal).ok,false)
 assert.equal(validateRunnerSnapshot({version:9,...goal,marks:{}},goal).ok,false)
})
test('manual rescue correction accepts a valid lap and protects existing crew check-ins',()=>{
 assert.deepEqual(assessRunnerCorrection({count:11,total:19,recorded:0}),
  {ok:true,count:11,reason:null})
 assert.equal(assessRunnerCorrection({count:3,total:19,recorded:5}).ok,false)
 assert.equal(assessRunnerCorrection({count:20,total:19,recorded:0}).ok,false)
 assert.equal(assessRunnerCorrection({count:4.2,total:19,recorded:0}).ok,false)
 assert.equal(assessRunnerCorrection({count:0,total:19,recorded:0}).ok,true)
})
test('exactly 19 segments remain derived from saved race plan, never GPS totals',()=>{
 const race=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
  movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
  paceSeconds:null,targetHours:15,carbsGPerHour:75,
  fluidMlPerHour:500,sodiumMgPerHour:500})
 assert.equal(race.checkpoints.length,19)
 const nearFinish=assessRunnerAdvance({completed:18,total:race.checkpoints.length,now:1795241000000})
 assert.equal(nearFinish.next,19)
 assert.equal(assessRunnerAdvance({completed:19,total:race.checkpoints.length,now:1795241000000}).ok,false)
})
test('Runner Mode visibly distinguishes a saved lap, storage failure, and unprepared gels',()=>{
 const runner=read('src/components/RaceRunnerFocus.tsx')
 const driver=read('src/components/RaceDayCockpit.tsx')
 const strategy=read('src/components/RaceStrategyCard.tsx')
 const gate=read('src/components/OnlineAccessGate.tsx')
 assert.match(runner,/Rundenspeicher geprüft/)
 assert.match(runner,/Rundenspeicher nicht bereit/)
 assert.match(runner,/Gel Buddy noch nicht geladen/)
 assert.match(runner,/role="alert"/)
 assert.match(runner,/role="status"/)
 assert.match(driver,/assessRunnerAdvance\(/)
 assert.match(driver,/lastTapRef\.current=decision\.stamp!/)
 assert.match(driver,/localStorage\.getItem\(key\)!==text/)
 assert.match(driver,/runnerTapAt:nextTapAt/)
 assert.match(driver,/validateRunnerSnapshot\(/)
 assert.match(driver,/Rundenzähler im Notfall korrigieren/)
 assert.match(driver,/onClick=\{correctRunner\}/)
 assert.match(driver,/needsRepair/)
 assert.match(strategy,/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//)
 assert.match(gate,/server-verified owner/)
 assert.match(gate,/status==='authorized'/)
 assert.doesNotMatch(runner,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b|\bRückstand\b|\bVorsprung\b/)
 assert.doesNotMatch(read('src/lib/raceRunnerSafety.mjs'),/fetch\(|supabase|Garmin API|navigator.geolocation/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validFuelMarks,updateFuelMark,recentFuelFeedback}
 from '../src/lib/raceFuelLog.mjs'
import {validateRunnerSnapshot}
 from '../src/lib/raceRunnerSafety.mjs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const goal={raceDate:'2026-11-21',raceName:'Heartbeat Ultra Fulda',total:19}
const snapshot=(completed=3,marks={})=>({version:1,raceDate:goal.raceDate,
 raceName:goal.raceName,runnerCompleted:completed,runnerTapAt:null,
 marks:{},fuelMarks:marks,startTime:'06:00'})

test('old race logs remain valid and do not imply food was consumed',()=>{
 const old=snapshot(5)
 delete old.fuelMarks
 const v=validateRunnerSnapshot(old,goal)
 assert.equal(v.ok,true)
 assert.deepEqual(v.fuelMarks,{})
 assert.equal(recentFuelFeedback(v.fuelMarks,{completed:5,total:19}),null)
 const fresh=validateRunnerSnapshot(null,goal)
 assert.deepEqual(fresh.fuelMarks,{})
})
test('nothing is recorded until the runner explicitly selects the actual outcome',()=>{
 assert.deepEqual(validFuelMarks({},{completed:3,total:19}),{})
 const planned=updateFuelMark({},{round:3,completed:3,total:19,status:'planned'})
 assert.equal(planned.ok,true)
 assert.deepEqual(planned.marks,{'3':'planned'})
 assert.equal(recentFuelFeedback(planned.marks,{completed:3,total:19}).status,'planned')
 const different=updateFuelMark(planned.marks,
  {round:3,completed:3,total:19,status:'different'})
 assert.equal(different.ok,true)
 assert.equal(different.marks['3'],'different')
 assert.match(recentFuelFeedback(different.marks,{completed:3,total:19}).text,
  /KH-Menge ist unbekannt/)
 const skipped=updateFuelMark(different.marks,
  {round:3,completed:3,total:19,status:'skipped'})
 assert.equal(skipped.ok,true)
 assert.match(recentFuelFeedback(skipped.marks,{completed:3,total:19}).text,
  /nicht alles auf einmal nachholen/)
 const cleared=updateFuelMark(skipped.marks,
  {round:3,completed:3,total:19,status:null})
 assert.equal(cleared.ok,true)
 assert.deepEqual(cleared.marks,{})
 assert.equal(recentFuelFeedback(cleared.marks,{completed:3,total:19}),null)
})
test('fuel flags are event-specific, bounded to completed rounds, safe and local',()=>{
 assert.equal(validFuelMarks({'4':'skipped'},{completed:3,total:19}),null)
 assert.equal(validFuelMarks({'0':'planned'},{completed:3,total:19}),null)
 assert.equal(validFuelMarks({'01':'planned'},{completed:3,total:19}),null)
 assert.equal(validFuelMarks({'3':'never'},{completed:3,total:19}),null)
 assert.equal(validFuelMarks([],{completed:3,total:19}),null)
 assert.equal(validFuelMarks({'20':'planned'},{completed:19,total:19}),null)
 assert.equal(updateFuelMark({},{round:4,completed:3,total:19,status:'planned'}).ok,false)
 assert.equal(updateFuelMark({},{round:3,completed:3,total:19,status:'100g'}).ok,false)
 assert.equal(validateRunnerSnapshot(snapshot(3,{'4':'planned'}),goal).ok,false)
 assert.equal(validateRunnerSnapshot(snapshot(3,{'3':'skipped'}),goal).ok,true)
 assert.equal(validateRunnerSnapshot(snapshot(3,{'3':'skipped'}),{
  ...goal,raceName:'Different race'
 }).ok,false)
})
test('undo/correction will drop notes for rounds no longer finished',()=>{
 const notes={'1':'planned','2':'skipped','3':'different'}
 const undo=Object.fromEntries(Object.entries(notes).filter(([round])=>Number(round)<3))
 assert.deepEqual(undo,{'1':'planned','2':'skipped'})
 assert.equal(validFuelMarks(undo,{completed:2,total:19})!==null,true)
 assert.equal(validFuelMarks(notes,{completed:2,total:19}),null)
})
test('runner records optional manual feedback inside same verified race log, never assumed from lap',()=>{
 const cockpit=read('src/components/RaceDayCockpit.tsx')
 const runner=read('src/components/RaceRunnerFocus.tsx')
 const safety=read('src/lib/raceRunnerSafety.mjs')
 const styles=read('src/styles/race-runner-focus.css')
 assert.match(cockpit,/fuelMarks:nextFuelMarks/)
 assert.match(cockpit,/localStorage\.getItem\(key\)!==text/)
 assert.match(cockpit,/updateFuelMark\(fuelMarks/)
 assert.match(cockpit,/setFuelMarks\(from\.fuelMarks\|\|\{\}\)/)
 assert.match(cockpit,/onFuelMark=\{recordFuel\}/)
 assert.match(cockpit,/fuelMarks=\{fuelMarks\}/)
 assert.match(cockpit,/Runden manuell bestätigt/)
 assert.match(cockpit,/VERPFLEGUNG \(nur manuell bestätigt\)/)
 assert.match(safety,/validFuelMarks\(snapshot\.fuelMarks\?\?\{\}/)
 assert.match(runner,/<details className="rrf-fuel-check">/)
 assert.match(runner,/Verpflegung nach Runde/)
 assert.match(runner,/Wie geplant/)
 assert.match(runner,/Etwas anderes/)
 assert.match(runner,/Ausgelassen/)
 assert.match(runner,/Eintrag löschen/)
 assert.match(runner,/recentFuelFeedback\(/)
 assert.match(styles,/rrf-fuel-check-actions/)
 assert.doesNotMatch(runner,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
 assert.doesNotMatch(runner,/localStorage|fetch\(|geolocation/)
 assert.doesNotMatch(read('src/lib/raceFuelLog.mjs'),
  /fetch\(|localStorage|supabase|autoAdjust|consumedCarbs|totalKcal/)
})

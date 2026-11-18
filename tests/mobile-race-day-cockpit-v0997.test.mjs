import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceDayCockpit,formatRaceElapsed,parseRaceElapsed,raceElapsedNow,
 recordRaceMark,sanitizeRaceMarks,undoLastRaceMark,raceDayLogText} from '../src/lib/raceDayCockpit.mjs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const heartbeat=(diff={})=>({
 distanceKm:112,courseMode:'laps',loopKm:6,movingMinutes:42,
 regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
 paceSeconds:null,targetHours:15,carbsGPerHour:75,
 fluidMlPerHour:500,sodiumMgPerHour:500,...diff
})
const init=(input=heartbeat(),marks={},startTime='06:00')=>
 buildRaceDayCockpit({input,marks,startTime})
const check=buildRaceExecution(heartbeat()).checkpoints
test('Heartbeat 18x6km + last 4km matches the existing 15-hour execution contract',()=>{
 const d=init()
 assert.equal(d.status,'ready')
 assert.equal(d.plan.estimate.totalMinutes,886)
 assert.equal(d.targetMinutes,900)
 assert.equal(d.plan.target.remaining,14)
 assert.equal(d.rows.length,19)
 assert.equal(d.rows[0].distanceKm,6)
 assert.equal(d.rows[0].arrivalMinutes,42)
 assert.equal(d.rows[0].departureMinutes,45)
 assert.equal(d.rows[2].longBreakMinutes,8)
 assert.equal(d.rows[2].pauseMinutes,11)
 assert.equal(d.rows[18].distanceKm,112)
 assert.equal(d.rows[18].legDistanceKm,4)
 assert.equal(d.rows[18].finish,true)
 assert.equal(d.rows[18].pauseMinutes,0)
 assert.equal(d.rows[18].arrivalMinutes,886)
 assert.equal(d.rows[0].plannedClock,'06:42')
 assert.equal(d.recorded,0)
 assert.equal(d.latest,null)
 assert.equal(d.buffer,null)
})
test('arrival is explicitly recorded and the actual delay reduces conditional buffer',()=>{
 const before={}
 const out=recordRaceMark(before,check,1,'arrival',45)
 assert.equal(out.ok,true)
 assert.deepEqual(before,{})
 const d=init(heartbeat(),out.marks)
 assert.equal(d.recorded,1)
 assert.equal(d.rows[0].arrival,45)
 assert.equal(d.rows[0].arrivalDelta,-3)
 assert.equal(d.rows[0].departure,null)
 assert.equal(d.buffer,11)
 assert.equal(d.lastAction.kind,'arrival')
 assert.equal(d.next.index,2)
 const depart=recordRaceMark(out.marks,check,1,'departure',47)
 const after=init(heartbeat(),depart.marks)
 assert.equal(after.rows[0].departure,47)
 assert.equal(after.buffer,12)
 assert.equal(after.lastAction.kind,'departure')
 assert.equal(after.next.index,2)
 assert.equal(after.lastAction.actualMinutes,47)
})
test('every normal loop can be manually logged and 4km finish has no invented pause',()=>{
 let marks={}
 for(let i=1;i<=check.length;i++){
  const a=recordRaceMark(marks,check,i,'arrival',check[i-1].arrivalMinutes)
  assert.equal(a.ok,true,'arrival '+i+': '+a.reason)
  marks=a.marks
  if(!check[i-1].finish){
   const d=recordRaceMark(marks,check,i,'departure',check[i-1].departureMinutes)
   assert.equal(d.ok,true,'departure '+i+': '+d.reason)
   marks=d.marks
  }
 }
 const d=init(heartbeat(),marks)
 assert.equal(d.recorded,19)
 assert.equal(d.finished,true)
 assert.equal(d.latest.index,19)
 assert.equal(d.rows[18].departure,null)
 assert.equal(d.buffer,14)
 assert.equal(d.next,null)
 const bad=recordRaceMark(marks,check,19,'departure',889)
 assert.equal(bad.ok,false)
 assert.match(bad.reason,/Ziel/)
})
test('missing previous lap, nonchronological times and invalid minutes are rejected',()=>{
 assert.equal(recordRaceMark({},check,2,'arrival',87).ok,false)
 assert.equal(recordRaceMark({},check,1,'departure',45).ok,false)
 assert.equal(recordRaceMark({},check,1,'arrival',-3).ok,false)
 assert.equal(recordRaceMark({},check,1,'arrival',2881).ok,false)
 let m=recordRaceMark({},check,1,'arrival',45).marks
 assert.equal(recordRaceMark(m,check,1,'departure',44).ok,false)
 m=recordRaceMark(m,check,1,'departure',48).marks
 assert.equal(recordRaceMark(m,check,2,'arrival',47).ok,false)
 m=recordRaceMark(m,check,2,'arrival',90).marks
 assert.equal(recordRaceMark(m,check,1,'departure',94).ok,false)
 assert.equal(recordRaceMark(m,check,1,'arrival',91).ok,false)
 const skip=recordRaceMark(m,check,0,'arrival',0)
 assert.equal(skip.ok,false)
})
test('manual edits retain chronology and undo returns only the last recorded event',()=>{
 let m=recordRaceMark({},check,1,'arrival',45).marks
 m=recordRaceMark(m,check,1,'departure',48).marks
 m=recordRaceMark(m,check,2,'arrival',92).marks
 let r=undoLastRaceMark(m,check)
 assert.equal(r.ok,true)
 assert.equal(r.marks['2'],undefined)
 r=undoLastRaceMark(r.marks,check)
 assert.equal(r.marks['1'].arrivalMinutes,45)
 assert.equal(r.marks['1'].departureMinutes,undefined)
 r=undoLastRaceMark(r.marks,check)
 assert.equal(Object.keys(r.marks).length,0)
 assert.equal(undoLastRaceMark({},check).ok,false)
})
test('stored tampered or stale data sanitized without fabricating missing laps',()=>{
 const corrupt={
  1:{arrivalMinutes:45,departureMinutes:46},
  2:{arrivalMinutes:42,departureMinutes:43},
  3:{arrivalMinutes:133,departureMinutes:143},
  19:{arrivalMinutes:900},
  __proto__:{foo:'bar'}
 }
 const cleaned=sanitizeRaceMarks(corrupt,check)
 assert.equal(cleaned['1'].arrivalMinutes,45)
 assert.equal(cleaned['1'].departureMinutes,46)
 assert.equal(cleaned['2'],undefined)
 assert.equal(cleaned['3'],undefined)
 assert.equal(cleaned['19'],undefined)
 assert.equal(init(heartbeat(),cleaned).recorded,1)
})
test('clock capture only on tap and only after real race start in Europe/Berlin',()=>{
 const raceDate='2026-11-21',startTime='06:00'
 assert.equal(raceElapsedNow({raceDate,startTime,now:new Date('2026-11-21T05:30:00Z')}),30)
 assert.equal(raceElapsedNow({raceDate,startTime,now:new Date('2026-11-21T04:30:00Z')}),null)
 assert.equal(raceElapsedNow({raceDate,startTime,now:new Date('2026-11-22T02:00:00Z')}),1260)
 assert.equal(raceElapsedNow({raceDate,startTime:null,now:new Date('2026-11-21T05:30:00Z')}),null)
 assert.equal(raceElapsedNow({raceDate:'2026-11-31',startTime}),null)
 assert.equal(parseRaceElapsed('02:15'),135)
 assert.equal(parseRaceElapsed('00:42'),42)
 assert.equal(parseRaceElapsed('49:00'),null)
 assert.equal(parseRaceElapsed('02:70'),null)
 assert.equal(formatRaceElapsed(900),'15:00')
 assert.equal(formatRaceElapsed(null),'–')
})
test('plan above time limit yields negative budget without optimistic prognosis',()=>{
 const d=init(heartbeat({longStopMinutes:12}))
 assert.equal(d.plan.estimate.totalMinutes,910)
 assert.equal(d.plan.target.remaining,-10)
 assert.equal(d.buffer,null)
 const late=init(heartbeat({longStopMinutes:12}),
  {'1':{arrivalMinutes:60}})
 assert.equal(late.buffer,-28)
})
test('missing race plan does not invent stations or split times',()=>{
 const no=init(heartbeat({loopKm:null}))
 assert.equal(no.status,'missing')
 assert.equal(no.rows.length,0)
 const other=init({distanceKm:31.1,courseMode:'point_to_point',loopKm:null,
  movingMinutes:null,regularPauseMinutes:null,longStopEvery:null,
  longStopMinutes:null,paceSeconds:360,targetHours:3.5,
  carbsGPerHour:null,fluidMlPerHour:null,sodiumMgPerHour:null})
 assert.equal(other.status,'ready')
 assert.equal(other.rows.length,1)
 assert.equal(other.rows[0].finish,true)
})
test('export is a labelled manual log and no invented race result',()=>{
 const d=init(heartbeat(),{'1':{arrivalMinutes:45}})
 const text=raceDayLogText({
  goal:{race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21'},
  model:d,startTime:'06:00'
 })
 assert.match(text,/Heartbeat Ultra Fulda/)
 assert.match(text,/Ankunft|Ist/)
 assert.match(text,/00:45/)
 assert.match(text,/manuell bestätigt, kein Garmin-Livetracking/)
 assert.doesNotMatch(text,/tatsächlich gefinisht|GPS live/)
})
test('Race Prep renders real Gel Buddy events, read-only forecast, offline backup and explicit checkpoint taps',()=>{
 const ui=read('src/components/RaceDayCockpit.tsx')
 const race=read('src/components/RaceStrategyCard.tsx')
 const gel=read('src/components/GelInventoryPlanner.tsx')
 const pure=read('src/lib/raceDayCockpit.mjs')
 const css=read('src/styles/race-day-cockpit.css')
 assert.match(race,/<RaceDayCockpit active=\{active\}/)
 assert.match(race,/fuelSchedule=\{fuelSchedule\}/)
 assert.match(race,/<GelInventoryPlanner active=\{active\}/)
 assert.match(gel,/onScheduleChange\(!loading&&loadedKey===key&&racePlan.status==='ready'/)
 assert.match(ui,/localStorage.setItem\(key/)
 assert.match(ui,/raceElapsedNow\(\{raceDate:goal.race_date/)
 assert.match(ui,/Ankunft jetzt erfassen/)
 assert.match(ui,/Weiter jetzt/)
 assert.match(ui,/Rennprotokoll kopieren/)
 assert.match(ui,/nicht zwischen Geräten synchronisiert/)
 assert.match(ui,/Keine Prognose deiner tatsächlichen Zielzeit/)
 assert.match(ui,/fuelSchedule===null/)
 assert.match(ui,/feelsLike/)
 assert.match(css,/@media\(max-width:520px\)/)
 assert.doesNotMatch(pure,/fetch\(|Garmin API|postToGarmin|navigator\.geolocation/)
 assert.doesNotMatch(ui,/\.from\(|service_role|garmin_api_secret/)
})

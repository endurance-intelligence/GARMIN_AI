import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recommendRacePlan} from '../src/lib/raceAutoPlan.mjs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Heartbeat 112 km uses established rounds and nutrition without typing',()=>{
 const p=recommendRacePlan({race_name:'Heartbeat Ultra Fulda',distance_km:112,target_hours:15})
 assert.equal(p.loopKm,'6');assert.equal(p.movingMinutes,'42')
 assert.equal(p.regularPause,'3');assert.equal(p.longStopEvery,'3')
 assert.equal(p.longStopMinutes,'8');assert.equal(p.carbs,'75')
 const result=buildRaceExecution({distanceKm:112,courseMode:p.courseMode,
  loopKm:Number(p.loopKm),movingMinutes:Number(p.movingMinutes),
  regularPauseMinutes:Number(p.regularPause),longStopEvery:Number(p.longStopEvery),
  longStopMinutes:Number(p.longStopMinutes),targetHours:15,
  carbsGPerHour:Number(p.carbs),fluidMlPerHour:Number(p.fluid),
  sodiumMgPerHour:Number(p.sodium)})
 assert.equal(result.status,'ready');assert.equal(result.checkpoints.length,19)
 assert.equal(result.checkpoints[0].departureMinutes,45)
 assert.equal(result.checkpoints[2].pauseMinutes,11)
 assert.ok(result.target.remaining>0)
 assert.equal(Math.round(result.nutrition.carbsG*4/100)*100,4400)
})
test('Unknown event course is not invented',()=>{
 assert.equal(recommendRacePlan({race_name:'Marathon',distance_km:42.195}),null)
})
test('Race Prep shows feels-like summary, course points, timeline, and shared weather',()=>{
 const w=read('src/components/RaceForecastCompact.tsx')
 const s=read('src/lib/raceForecastShare.mjs')
 const r=read('src/components/RaceStrategyCard.tsx')
 const card=read('src/components/RaceExecutionCard.tsx')
 assert.match(w,/Gefühlte Temperatur/)
 assert.match(w,/hours.map\(x=>x.feelsLike\)/)
 assert.match(w,/stage.weather.feelsLike/)
 assert.match(w,/h.feelsLike/)
 assert.match(s,/info.feels/)
 assert.match(r,/recommendRacePlan\(nextGoal\)/)
 assert.match(r,/setDraft\(data\?asDraft/)
 assert.match(r,/garmin_weight_outbox/)
 assert.match(card,/data.nutrition.carbsG\*4/)
})

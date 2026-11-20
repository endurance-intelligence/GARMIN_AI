import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'
import {buildRaceFuelRoadmap} from '../src/lib/raceFuelRoadmap.mjs'
import {eventMenuForRace} from '../src/lib/raceEventMenu.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const checkpoints=buildRaceExecution({distanceKm:112,courseMode:'laps',
 loopKm:6,movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,
 longStopMinutes:8,paceSeconds:null,targetHours:15,
 carbsGPerHour:75,fluidMlPerHour:500,sodiumMgPerHour:500}).checkpoints
const menu=eventMenuForRace({raceDate:'2026-11-21',raceName:'Heartbeat Ultra Fulda'})
const settings={aid_confirmed:true,aid_every_laps:1,
 aid_drink_mix:'160',aid_drink_ml_per_stop:250,aid_custom_carbs_g_per_500:0,
 aid_food_name:'',aid_food_carbs_g_per_stop:0}
const sampleGel=[{minute:20,brand:'Maurten',name:'Gel 100',
 carbsG:25,caffeineMg:0,planOnly:true},
 {minute:220,brand:'226ERS',name:'High Energy Gel',
 carbsG:50,caffeineMg:0,planOnly:true}]

test('45-minute normal lap gets proportional carb target and all four inputs exactly once',()=>{
 const aid=buildAidPlan({checkpoints,settings,startTime:'06:00'})
 const result=buildRaceFuelRoadmap({
  checkpoints,aidEvents:aid.events,gelEvents:sampleGel,eventMenu:menu,
  targetCarbsGPerHour:75,ownDrinkCarbsGPerHour:10
 })
 assert.equal(result.status,'ready')
 assert.equal(result.rounds.length,19)
 assert.equal(result.rounds[0].lapMinutes,45)
 assert.equal(result.rounds[0].targetCarbsG,56.3)
 assert.equal(result.rounds[0].gelCarbsG,25)
 assert.equal(result.rounds[0].foodCarbsG,0)
 assert.equal(result.rounds[0].drinkCarbsG,20)
 assert.equal(result.rounds[0].knownCarbsG,45)
 assert.equal(result.rounds[0].ownDrinkCarbsG,7.5)
 assert.equal(result.rounds[0].plannedTotalCarbsG,52.5)
 assert.equal(result.rounds[0].openCarbsG,3.8)
 assert.equal(result.rounds[0].menuAvailable,true)
 assert.equal(result.rounds[0].foodConfirmed,false)
 assert.equal(result.rounds[0].planOnly,true)
 assert.equal(result.rounds[2].lapMinutes,53)
 assert.equal(result.rounds[2].targetCarbsG,66.3)
 assert.equal(result.rounds[18].lapMinutes,28)
 assert.equal(result.rounds[18].targetCarbsG,35)
 assert.equal(result.rounds[18].drinkCarbsG,0)
 assert.equal(result.rounds[18].foodCarbsG,0)
 assert.equal(result.totals.gelCarbsG,75)
 assert.equal(result.totals.drinkCarbsG,360)
 assert.equal(result.totals.foodCarbsG,0)
 assert.ok(Math.abs(result.totals.targetCarbsG-1107.5)<1)
 assert.ok(Math.abs(result.totals.ownDrinkCarbsG-147.7)<1)
 assert.ok(Math.abs(result.totals.plannedTotalCarbsG-
   (75+360+result.totals.ownDrinkCarbsG))<0.2)
 assert.ok(Math.abs(result.totals.openCarbsG-
  Math.max(0,result.totals.targetCarbsG-result.totals.plannedTotalCarbsG))<0.2)
})
test('choosing 0, 150, 250 and 500ml never assumes a drink until confirmation',()=>{
 for(const ml of [0,150,250,500]){
  const off=buildAidPlan({checkpoints,settings:{...settings,
   aid_confirmed:false,aid_drink_ml_per_stop:ml}})
  assert.equal(off.totalCarbsG,0)
  assert.equal(off.stops,0)
  const on=buildAidPlan({checkpoints,settings:{...settings,
   aid_drink_ml_per_stop:ml}})
  assert.equal(on.totalCarbsG,ml*40/500*18)
  assert.equal(on.events.length,ml===0?0:18)
 }
})
test('food on event menu is NOT a known 30g serving and does not reduce planned gels',()=>{
 const drink=buildAidPlan({checkpoints,settings:{...settings,
  aid_food_name:'Nudeln, Brötchen, Banane',aid_food_carbs_g_per_stop:0}})
 const plan=buildRaceFuelRoadmap({checkpoints,aidEvents:drink.events,
  gelEvents:sampleGel,eventMenu:menu,targetCarbsGPerHour:75})
 assert.equal(plan.rounds[2].menuAvailable,true)
 assert.equal(plan.rounds[2].foodConfirmed,true)
 assert.equal(plan.rounds[2].foodCarbsG,0)
 assert.equal(plan.rounds[2].knownCarbsG,20)
 assert.equal(plan.rounds[2].plannedTotalCarbsG,20)
 assert.ok(plan.rounds[2].openCarbsG>0)
 assert.equal(plan.totals.foodCarbsG,0)
 assert.equal(plan.totals.gelCount,2)
 assert.equal(plan.note.includes('kein Zwang'),true)
})
test('unknown or pending plans do not fabricate numeric uncovered grams',()=>{
 const pending=buildRaceFuelRoadmap({checkpoints,eventMenu:menu,
  gelEvents:null,aidEvents:null,targetCarbsGPerHour:75})
 assert.equal(pending.rounds[0].openCarbsG,null)
 assert.equal(pending.totals.openCarbsG,null)
 const unknownAid=buildRaceFuelRoadmap({checkpoints,eventMenu:menu,
  gelEvents:sampleGel,aidEvents:null,targetCarbsGPerHour:75})
 assert.equal(unknownAid.rounds[0].openCarbsG,null)
 const noTarget=buildRaceFuelRoadmap({checkpoints,eventMenu:menu,
  gelEvents:sampleGel,aidEvents:[],targetCarbsGPerHour:null})
 assert.equal(noTarget.rounds[0].targetCarbsG,null)
 assert.equal(noTarget.rounds[0].openCarbsG,null)
 const knownZero=buildRaceFuelRoadmap({checkpoints,
  gelEvents:sampleGel,aidEvents:[],targetCarbsGPerHour:75})
 assert.ok(knownZero.rounds[0].openCarbsG>0)
 assert.equal(knownZero.rounds[0].drinkCarbsG,0)
 assert.equal(knownZero.rounds[0].foodCarbsG,0)
 assert.equal(knownZero.rounds[0].ownDrinkCarbsG,0)
})
test('per-lap 19-item table reconciles planned hours exactly, without exposing budget to runner',()=>{
 const plan=buildRaceFuelRoadmap({checkpoints,eventMenu:menu,
  gelEvents:sampleGel,aidEvents:[],targetCarbsGPerHour:60,
  ownDrinkCarbsGPerHour:20})
 assert.equal(plan.rounds.reduce((n,r)=>n+r.lapMinutes,0),886)
 assert.equal(plan.rounds.length,19)
 assert.equal(plan.totals.caffeineMg,0)
 assert.ok(Math.abs(plan.totals.targetCarbsG-886)<1)
 assert.ok(Math.abs(plan.totals.ownDrinkCarbsG-295.3)<1)
 assert.ok(plan.rounds.every(r=>r.plannedTotalCarbsG>=r.knownCarbsG))
 const runner=read('src/components/RaceRunnerFocus.tsx')
 assert.doesNotMatch(runner,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
 assert.doesNotMatch(runner,/openCarbsG|targetCarbsG|gip-carb-balance/)
})
test('runner remains unchanged; crew-only quick choices cannot silently save revised gel plan',()=>{
 const ui=read('src/components/GelInventoryPlanner.tsx')
 const core=read('src/lib/raceFuelRoadmap.mjs')
 const css=read('src/styles/gel-inventory.css')
 assert.match(ui,/\[0,150,250,500\]\.map/)
 assert.match(ui,/aria-pressed=\{settings\.aid_drink_ml_per_stop===ml\}/)
 assert.match(ui,/changeSettings\(\{aid_drink_ml_per_stop:ml\}\)/)
 assert.match(ui,/Erst mit aktivierter Bestätigung und gespeichertem Plan/)
 assert.match(ui,/if\(!onScheduleChange\|\|settingsDirty\)return/)
 assert.match(ui,/if\(!onAidScheduleChange\|\|settingsDirty\)return/)
 assert.match(ui,/settingsDirty\?'Verpflegungsplan speichern'/)
 assert.match(ui,/openCarbsG/)
 assert.match(ui,/ownDrinkCarbsG/)
 assert.match(ui,/gip-carb-balance/)
 assert.match(css,/gip-mix-quick/)
 assert.match(css,/@media\(max-width:700px\)/)
 assert.match(core,/previousDeparture=i===0\?0:checkpoints\[i-1\]\.departureMinutes/)
 assert.doesNotMatch(core,/fetch\(|localStorage|supabase|autoConsume/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildRaceFuelRoadmap} from '../src/lib/raceFuelRoadmap.mjs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const checkpoints=buildRaceExecution({distanceKm:112,courseMode:'laps',
 loopKm:6,movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,
 longStopMinutes:8,paceSeconds:null,targetHours:15,
 carbsGPerHour:75,fluidMlPerHour:500,sodiumMgPerHour:500}).checkpoints
const gel=(minute,name,caffeineMg=0)=>({
 minute,id:'secret-stock-'+minute,name,brand:'Maurten',flavor:'Neutral',
 carbsG:25,caffeineMg,clock:null,cumulativeCarbsG:25
})
const aidSettings={aid_confirmed:true,aid_every_laps:1,
 aid_drink_mix:'160',aid_drink_ml_per_stop:250,
 aid_custom_carbs_g_per_500:0,
 aid_food_name:'Nudeln, Brötchen, Banane',aid_food_carbs_g_per_stop:30}

test('all 19 rounds are covered, six long stops exactly on the athlete schedule',()=>{
 const plan=buildRaceFuelRoadmap({checkpoints,gelEvents:[],aidEvents:[]})
 assert.equal(plan.status,'ready')
 assert.equal(plan.rounds.length,19)
 assert.equal(plan.totals.longStops,6)
 assert.deepEqual(plan.rounds.filter(r=>r.breakType==='long').map(r=>r.round),
  [3,6,9,12,15,18])
 assert.equal(plan.rounds[0].breakType,'short')
 assert.equal(plan.rounds[2].pauseMinutes,11)
 assert.equal(plan.rounds[18].breakType,'finish')
 assert.equal(plan.rounds[18].pauseMinutes,0)
 assert.match(plan.rounds[2].coachHint,/Schuhe\/Kleidung/)
 assert.equal(plan.rounds[0].phase,'early')
 assert.equal(plan.rounds[12].phase,'late')
 assert.equal(plan.rounds[18].finish,true)
})
test('real planned aid drink, foods and gels are counted once in matching rounds',()=>{
 const aid=buildAidPlan({checkpoints,settings:aidSettings,startTime:'06:00'})
 const gels=[gel(20,'Gel 100'),gel(42,'Gel 100'),gel(720,'CAF 100',100)]
 const plan=buildRaceFuelRoadmap({checkpoints,gelEvents:gels,aidEvents:aid.events})
 assert.equal(plan.status,'ready')
 assert.equal(plan.totals.gelCount,3)
 assert.equal(plan.totals.gelCarbsG,75)
 assert.equal(plan.totals.foodCarbsG,540)
 assert.equal(plan.totals.drinkCarbsG,360)
 assert.equal(plan.totals.caffeineMg,100)
 assert.equal(plan.rounds[0].gelCount,2)
 assert.equal(plan.rounds[0].gelCarbsG,50)
 assert.equal(plan.rounds[0].foodCarbsG,30)
 assert.equal(plan.rounds[0].drinkCarbsG,20)
 assert.equal(plan.rounds[0].knownCarbsG,100)
 assert.equal(plan.rounds[1].gelCount,0)
 assert.equal(plan.rounds[1].foodCarbsG,30)
 assert.equal(plan.rounds[15].caffeineMg,100)
 assert.equal(plan.rounds[15].phase,'late')
 assert.equal(plan.rounds.filter(r=>r.caffeineMg>0).length,1)
 assert.equal(plan.rounds[18].drinkCarbsG,0)
 assert.equal(plan.rounds[18].foodCarbsG,0)
 assert.equal(plan.note.includes('Keine Portion als konsumiert'),true)
 assert.doesNotMatch(JSON.stringify(plan),/secret-stock-|cumulativeCarbsG|activity_id|positionLat/)
})
test('no confirmed food or drinks means no fictitious carbohydrate credit',()=>{
 const plan=buildRaceFuelRoadmap({checkpoints,gelEvents:[],aidEvents:[]})
 assert.equal(plan.totals.foodCarbsG,0)
 assert.equal(plan.totals.drinkCarbsG,0)
 assert.equal(plan.totals.caffeineMg,0)
 assert.equal(plan.rounds[1].primary,'halbes Brötchen')
 assert.equal(plan.rounds[1].foodConfirmed,false)
 assert.equal(plan.rounds[2].primary,'kleine Portion Nudeln')
 assert.equal(plan.rounds[2].breakType,'long')
 assert.equal(plan.rounds[3].primary,'Banane oder etwas Salzgebäck')
 const lateLong=plan.rounds[14]
 assert.equal(lateLong.breakType,'long')
 assert.match(lateLong.primary,/Nudeln/)
 assert.match(lateLong.primary,/verträglich/)
 assert.equal(lateLong.knownCarbsG,0)
})
test('no automatic caffeine: later caffeine is visible only when an actual gel is planned',()=>{
 const without=buildRaceFuelRoadmap({checkpoints,gelEvents:[],aidEvents:[]})
 assert.ok(without.rounds.every(r=>r.caffeineMg===0))
 const withCafe=buildRaceFuelRoadmap({checkpoints,gelEvents:[gel(720,'CAF 100',100)],aidEvents:[]})
 assert.equal(withCafe.rounds[15].caffeineMg,100)
 assert.equal(withCafe.rounds[0].caffeineMg,0)
 assert.equal(withCafe.totals.caffeineMg,100)
 const noOther=buildRunnerFocus({checkpoints,completed:15,gelEvents:[]})
 assert.equal(noOther.meal.caffeineMg,0)
})
test('race fueling input missing or point-to-point does not invent 19 stations',()=>{
 assert.equal(buildRaceFuelRoadmap({checkpoints:[]}).status,'missing')
 const simple=buildRaceExecution({distanceKm:31.1,courseMode:'point_to_point',
  loopKm:null,movingMinutes:null,regularPauseMinutes:null,
  longStopEvery:null,longStopMinutes:null,paceSeconds:360,targetHours:4,
  carbsGPerHour:60,fluidMlPerHour:400,sodiumMgPerHour:300}).checkpoints
 const plan=buildRaceFuelRoadmap({checkpoints:simple,gelEvents:[],aidEvents:[]})
 assert.equal(plan.rounds.length,1)
 assert.equal(plan.totals.longStops,0)
 assert.equal(plan.rounds[0].breakType,'finish')
})
test('crew has all 19 rounds, runner stays single-round and never reveals kilometers',()=>{
 const runner=read('src/components/RaceRunnerFocus.tsx')
 const planner=read('src/components/GelInventoryPlanner.tsx')
 const model=read('src/lib/raceFuelRoadmap.mjs')
 assert.match(runner,/roundAdvice\.coachHint/)
 assert.match(runner,/roundAdvice!\.caffeineMg/)
 assert.match(runner,/DIESE RUNDE · VERPFLEGUNG/)
 assert.match(planner,/19 Runden|roundRoadmap\.rounds\.length/)
 assert.match(planner,/Essensfahrplan, Pausen und Koffein ansehen/)
 assert.match(planner,/gip-round-plan/)
 assert.match(planner,/settingsDirty/)
 assert.match(model,/buildRunnerFocus/)
 assert.match(model,/planOnly:true/)
 assert.doesNotMatch(runner,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
 assert.doesNotMatch(model,/fetch\(|localStorage|supabase|postWorkout|consumeInventory/)
})

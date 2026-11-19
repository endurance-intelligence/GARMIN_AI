import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const rows=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
 paceSeconds:null,targetHours:15,carbsGPerHour:75,fluidMlPerHour:500,
 sodiumMgPerHour:500}).checkpoints
const gel=(minute,name,caffeineMg=0)=>({
 minute,id:'owned-'+minute,name,brand:'Maurten',
 flavor:'Neutral',clock:null,carbsG:25,caffeineMg,cumulativeCarbsG:25
})
const gels=[gel(20,'Gel 100'),gel(40,'Gel 100'),
 gel(220,'Gel 100 CAF 100',100),gel(410,'Gel 100')]

test('a planned gel is only shown in its own round; no future gel as food alternative',()=>{
 const first=buildRunnerFocus({checkpoints:rows,completed:0,gelEvents:gels})
 assert.equal(first.meal.primaryKind,'gel')
 assert.equal(first.meal.plannedGelCount,2)
 assert.equal(first.meal.plannedGelCarbsG,50)
 assert.deepEqual(first.meal.additionalGelNames,['Maurten · Gel 100'])
 assert.equal(first.meal.gelDue,false)
 const second=buildRunnerFocus({checkpoints:rows,completed:1,gelEvents:gels})
 assert.equal(second.nextIndex,2)
 assert.equal(second.meal.primaryKind,'food')
 assert.equal(second.meal.plannedGelCount,0)
 assert.equal(second.meal.gelScheduled,false)
 assert.equal(second.meal.caffeineMg,0)
 assert.doesNotMatch(JSON.stringify(second.meal),/CAF 100/)
 const fifth=buildRunnerFocus({checkpoints:rows,completed:4,gelEvents:gels})
 assert.equal(fifth.meal.primaryKind,'gel')
 assert.equal(fifth.meal.plannedGelCount,1)
 assert.equal(fifth.meal.caffeineMg,100)
})
test('two gels per round are never silently reduced to one planned portion',()=>{
 const one=buildRunnerFocus({checkpoints:rows,completed:0,
   gelEvents:[gel(20,'First'),gel(40,'Second')]})
 assert.equal(one.meal.plannedGelCount,2)
 assert.equal(one.meal.plannedGelCarbsG,50)
 assert.ok(one.meal.additionalGelNames[0].includes('Second'))
 const onTime=buildRunnerFocus({checkpoints:rows,completed:0,
   gelEvents:[gel(20,'First'),gel(40,'Second')],elapsedMinutes:22})
 assert.equal(onTime.meal.gelDue,false)
 assert.match(onTime.meal.primary,/Second/)
 assert.ok(onTime.meal.additionalGelNames[0].includes('First'))
 // No synthetic consumption record: a passed time does not mean it was eaten.
 assert.equal(onTime.meal.planOnly,true)
})
test('confirmed food already counted in KH is ADDITIONAL to planned gel, not a substitute',()=>{
 const settings={aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'160',
  aid_drink_ml_per_stop:250,aid_custom_carbs_g_per_500:0,
  aid_food_name:'Nudeln, Brötchen',aid_food_carbs_g_per_stop:30}
 const aid=buildAidPlan({checkpoints:rows,settings,startTime:'06:00'})
 const round1=buildRunnerFocus({checkpoints:rows,completed:0,gelEvents:gels,
  aidEvents:aid.events})
 assert.equal(round1.meal.primaryKind,'gel')
 assert.equal(round1.meal.alternative,'Nudeln')
 assert.equal(round1.meal.foodConfirmed,true)
 assert.equal(round1.meal.foodCarbsCounted,true)
 assert.equal(round1.meal.foodIsAdditional,true)
 assert.equal(round1.meal.plannedFoodCarbsG,30)
 assert.equal(round1.meal.plannedDrinkCarbsG,20)
 const round2=buildRunnerFocus({checkpoints:rows,completed:1,gelEvents:gels,
  aidEvents:aid.events})
 assert.equal(round2.meal.primaryKind,'food')
 assert.equal(round2.meal.primary,'Brötchen')
 assert.equal(round2.meal.plannedFoodCarbsG,30)
 assert.equal(round2.meal.foodIsAdditional,false)
})
test('if food portion has no known KH, no gel is silently replaced and unknown stays zero',()=>{
 const settings={aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'unknown',
  aid_drink_ml_per_stop:0,aid_custom_carbs_g_per_500:0,
  aid_food_name:'Nudeln',aid_food_carbs_g_per_stop:0}
 const aid=buildAidPlan({checkpoints:rows,settings})
 const view=buildRunnerFocus({checkpoints:rows,completed:0,
  gelEvents:[gel(20,'My Gel')],aidEvents:aid.events})
 assert.equal(view.meal.primaryKind,'gel')
 assert.equal(view.meal.alternative,'Nudeln')
 assert.equal(view.meal.plannedFoodCarbsG,0)
 assert.equal(view.meal.foodCarbsCounted,false)
 assert.equal(view.meal.foodIsAdditional,false)
 assert.equal(view.meal.plannedGelCarbsG,25)
 assert.equal(view.meal.planOnly,true)
})
test('GUI states planned, never consumed; round numbers without distressing distance display',()=>{
 const view=read('src/components/RaceRunnerFocus.tsx')
 const model=read('src/lib/raceRunnerFocus.mjs')
 assert.match(view,/DIESE RUNDE · VERPFLEGUNG/)
 assert.match(view,/foodIsAdditional\?'ZUSÄTZLICH EINGEPLANT':'ALTERNATIVE'/)
 assert.match(view,/view.meal.additionalGelNames/)
 assert.match(view,/Kein automatischer Gel-Ersatz/)
 assert.match(view,/Gel ist bereits im KH-Plan/)
 assert.match(view,/Jetzt Gel: /)
 assert.match(model,/roundGels=validRound/)
 assert.match(model,/plannedGelCount:roundGels.length/)
 assert.doesNotMatch(view,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
 assert.doesNotMatch(model,/localStorage|fetch\(|geolocation|supabase/)
})

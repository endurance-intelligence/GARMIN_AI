import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const checkpoints=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
 paceSeconds:null,targetHours:15,carbsGPerHour:75,fluidMlPerHour:500,
 sodiumMgPerHour:500}).checkpoints
const gel=[{id:'g1',minute:20,clock:'06:20',brand:'SiS',name:'BETA Fuel Energy Gel',
 flavor:'Standard',carbsG:40,caffeineMg:0,cumulativeCarbsG:40},
 {id:'g2',minute:220,clock:'09:40',brand:'226ERS',name:'High Energy Gel',
  flavor:'Neutral',carbsG:50,caffeineMg:0,cumulativeCarbsG:90}]

test('each round gets one rotating meal decision, not an entire gel list',()=>{
 const first=buildRunnerFocus({checkpoints,completed:0,gelEvents:gel})
 const second=buildRunnerFocus({checkpoints,completed:1,gelEvents:gel})
 const third=buildRunnerFocus({checkpoints,completed:2,gelEvents:gel})
 const fourth=buildRunnerFocus({checkpoints,completed:3,gelEvents:gel})
 const fifth=buildRunnerFocus({checkpoints,completed:4,gelEvents:gel})
 assert.equal(first.meal.primaryKind,'gel')
 assert.match(first.meal.primary,/BETA Fuel/)
 assert.match(second.meal.primary,/Nudeln/)
 assert.match(third.meal.primary,/Brötchen/)
 assert.match(fourth.meal.primary,/Banane/)
 assert.equal(fifth.meal.primaryKind,'gel')
 assert.equal(second.meal.alternativeKind,'food')
 assert.equal(second.meal.gelScheduled,false)
 assert.equal(second.meal.plannedGelCount,0)
 assert.ok(!second.meal.alternative.includes('High Energy Gel'))
 assert.equal(second.meal.foodConfirmed,false)
 assert.equal(first.meal.planOnly,true)
 assert.ok(first.meal.drink.includes('Maurten Drink Mix'))
 assert.equal(buildRunnerFocus({checkpoints,completed:19}).meal,null)
})
test('confirmed on-site options rotate per stop while unknown food contributes zero carbs',()=>{
 const settings={aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'unknown',
  aid_drink_ml_per_stop:0,aid_custom_carbs_g_per_500:0,
  aid_food_name:'Nudeln, Brötchen, Banane',aid_food_carbs_g_per_stop:0}
 const aid=buildAidPlan({checkpoints,settings,startTime:'06:00'})
 assert.equal(aid.status,'ready')
 assert.equal(aid.events.length,18)
 assert.equal(aid.totalCarbsG,0)
 assert.equal(aid.foodCarbsG,0)
 assert.equal(aid.events[0].foodName,'Nudeln')
 assert.equal(aid.events[1].foodName,'Brötchen')
 assert.equal(aid.events[2].foodName,'Banane')
 assert.equal(aid.events[3].foodName,'Nudeln')
 const second=buildRunnerFocus({checkpoints,completed:1,gelEvents:gel,aidEvents:aid.events})
 assert.equal(second.meal.primary,'Brötchen')
 assert.equal(second.meal.foodConfirmed,true)
 assert.equal(second.meal.drinkConfirmed,false)
 assert.equal(second.meal.alternativeKind,'food')
 assert.equal(second.nextAid.carbsG,0)
})
test('no menu confirmation means candidate food, never confirmed event or fake intake',()=>{
 const settings={aid_confirmed:false,aid_every_laps:1,aid_drink_mix:'320',
  aid_drink_ml_per_stop:250,aid_custom_carbs_g_per_500:0,
  aid_food_name:'Nudeln, Brötchen',aid_food_carbs_g_per_stop:30}
 const aid=buildAidPlan({checkpoints,settings})
 assert.equal(aid.events.length,0)
 assert.equal(aid.totalCarbsG,0)
 const suggestion=buildRunnerFocus({checkpoints,completed:1,aidEvents:aid.events})
 assert.equal(suggestion.meal.foodConfirmed,false)
 assert.equal(suggestion.meal.planOnly,true)
 assert.equal(suggestion.meal.gelScheduled,false)
 assert.doesNotMatch(JSON.stringify(suggestion),/actualConsumption|consumed|recordedCarbs/)
})
test('confirmed Maurten drink stays explicit and no invented mixing math enters the runner',()=>{
 const settings={aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'160',
  aid_drink_ml_per_stop:250,aid_custom_carbs_g_per_500:0,
  aid_food_name:'Nudeln, Brötchen',aid_food_carbs_g_per_stop:0}
 const aid=buildAidPlan({checkpoints,settings,startTime:'06:00'})
 const second=buildRunnerFocus({checkpoints,completed:1,aidEvents:aid.events})
 assert.match(second.meal.drink,/250 ml Maurten Drink Mix 160/)
 assert.equal(second.meal.drinkConfirmed,true)
 assert.equal(second.nextAid.drinkCarbsG,20)
 assert.equal(second.nextAid.foodCarbsG,0)
 assert.equal(second.meal.foodConfirmed,true)
})
test('runner UI presents one recommendation with fallback, replaces parallel cards',()=>{
 const ui=read('src/components/RaceRunnerFocus.tsx')
 const css=read('src/styles/race-runner-focus.css')
 const planner=read('src/components/GelInventoryPlanner.tsx')
 assert.match(ui,/DIESE RUNDE · VERPFLEGUNG/)
 assert.match(ui,/className="rrf-meal-primary"/)
 assert.match(ui,/className="rrf-meal-bottom"/)
 assert.match(ui,/ALTERNATIVE/)
 assert.match(ui,/view.meal.primary/)
 assert.match(ui,/view.meal.alternative/)
 assert.match(ui,/view.meal.drink/)
 assert.match(ui,/nichts automatisch verbucht/)
 assert.doesNotMatch(ui,/className="rrf-fuel"/)
 assert.doesNotMatch(ui,/className="rrf-aid-hint"/)
 assert.match(planner,/Nudeln, Brötchen, Banane/)
 assert.match(planner,/Bei unbekannten Portionsgrößen 0 g eintragen/)
 assert.match(css,/@media\(max-width:600px\)/)
 assert.doesNotMatch(ui,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
})

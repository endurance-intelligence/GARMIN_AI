import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {eventMenuForRace,suggestEventFood,HEARTBEAT_MENU_2026}
 from '../src/lib/raceEventMenu.mjs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'
import {buildRaceFuelRoadmap} from '../src/lib/raceFuelRoadmap.mjs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const name='Heartbeat Ultra Fulda'
const date='2026-11-21'
const menu=eventMenuForRace({raceName:name,raceDate:date})
const checkpoints=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
 paceSeconds:null,targetHours:15,carbsGPerHour:75,fluidMlPerHour:500,
 sodiumMgPerHour:500}).checkpoints
const settings={aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'160',
 aid_drink_ml_per_stop:0,aid_custom_carbs_g_per_500:0,
 aid_food_name:'',aid_food_carbs_g_per_stop:0}

test('Heartbeat menu precisely reflects supplied organiser catering with confirmed self-serve Drink Mix 160',()=>{
 assert.equal(menu,HEARTBEAT_MENU_2026)
 assert.equal(menu.carbDrinkStrength,'160')
 assert.equal(menu.carbDrinkSelfServe,true)
 assert.match(menu.note,/großem Behälter/)
 assert.match(menu.note,/40 g KH\/500 ml/)
 for(const word of ['MAURTEN Gels','MAURTEN Riegel','MAURTEN Carbdrink',
  'Apfel','Banane','Orange','belegte Brötchen','Kartoffeln',
  'Nudeln mit Tomatensoße','Salzbrezeln','Schorle','Kuchen'])
  assert.ok(menu.carbs.some(x=>x.includes(word)),word)
 for(const word of ['Brühe','Essiggurken','Gurke mit Salz','gesalzene Erdnüsse'])
  assert.ok(menu.saltyWarm.some(x=>x.includes(word)))
 for(const word of ['Wasser','Tee','Kaffee','Cola'])
  assert.ok(menu.otherDrinks.includes(word))
 assert.ok(menu.caffeine.includes('Cola'))
 assert.ok(menu.caffeine.includes('Kaffee'))
 assert.ok(!menu.caffeine.some(x=>x.includes('Koffein-Gels')),
  'Maurten gels at event do not prove caffeinated versions')
})
test('new organizer knowledge does NOT assume any drink volume, KH, caffeine or eating',()=>{
 const zero=buildAidPlan({checkpoints,settings,startTime:'06:00'})
 assert.equal(zero.status,'ready')
 assert.equal(zero.stops,0)
 assert.equal(zero.drinkCarbsG,0)
 assert.equal(zero.fluidMl,0)
 assert.equal(zero.totalCarbsG,0)
 const focus=buildRunnerFocus({checkpoints,completed:0,aidEvents:zero.events,
  eventMenu:menu,gelEvents:[]})
 assert.match(focus.meal.drink,/Drink Mix 160/)
 assert.match(focus.meal.drink,/frei zugänglich/)
 assert.equal(focus.meal.drinkConfirmed,false)
 assert.equal(focus.meal.plannedDrinkCarbsG,0)
 assert.equal(focus.meal.planOnly,true)
 const roadmap=buildRaceFuelRoadmap({checkpoints,gelEvents:[],aidEvents:zero.events,eventMenu:menu})
 assert.equal(roadmap.rounds.length,19)
 assert.equal(roadmap.totals.drinkCarbsG,0)
 assert.equal(roadmap.totals.foodCarbsG,0)
 assert.equal(roadmap.totals.caffeineMg,0)
 assert.equal(roadmap.rounds[2].menuAvailable,true)
 assert.equal(roadmap.rounds[2].foodConfirmed,false)
 assert.equal(roadmap.rounds[2].knownCarbsG,0)
})
test('self-selected Drink Mix 160 portion credits only the selected volume after save',()=>{
 const half=buildAidPlan({checkpoints,
  settings:{...settings,aid_drink_ml_per_stop:250},startTime:'06:00'})
 assert.equal(half.status,'ready')
 assert.equal(half.stops,18)
 assert.equal(half.events[0].drinkCarbsG,20)
 assert.equal(half.events[0].drinkMl,250)
 assert.equal(half.drinkCarbsG,360)
 assert.equal(half.foodCarbsG,0)
 const bottle=buildAidPlan({checkpoints,
  settings:{...settings,aid_drink_ml_per_stop:500}})
 assert.equal(bottle.events[0].drinkCarbsG,40)
 assert.equal(bottle.drinkCarbsG,720)
 const unchecked=buildAidPlan({checkpoints,settings:{
  ...settings,aid_confirmed:false,aid_drink_ml_per_stop:500}})
 assert.equal(unchecked.events.length,0)
 assert.equal(unchecked.totalCarbsG,0)
})
test('meal suggestions rotate actual supplied foods and warm long stops, no unwanted orange',()=>{
 assert.equal(checkpoints.length,19)
 const roadmap=buildRaceFuelRoadmap({checkpoints,gelEvents:[],aidEvents:[],eventMenu:menu})
 assert.equal(roadmap.totals.longStops,6)
 assert.match(roadmap.rounds[0].primary,/Banane/)
 assert.match(roadmap.rounds[1].primary,/Brötchen/)
 assert.match(roadmap.rounds[2].primary,/Nudeln mit Tomatensoße/)
 assert.match(roadmap.rounds[5].primary,/Kartoffeln/)
 assert.match(roadmap.rounds[8].primary,/Brötchen/)
 assert.ok(roadmap.rounds.every(r=>!r.primary?.includes('Orange')))
 assert.equal(roadmap.rounds[18].finish,true)
 assert.equal(roadmap.rounds[18].knownCarbsG,0)
 assert.equal(suggestEventFood(menu,{round:1,longPause:false}).availableAtEvent,true)
 assert.equal(suggestEventFood(menu,{round:0,longPause:false}),null)
})
test('confirmed menu is event-scoped and does not alter other race recommendations',()=>{
 assert.equal(eventMenuForRace({raceName:'Hermannslauf',raceDate:date}),null)
 assert.equal(eventMenuForRace({raceName:name,raceDate:'2027-11-21'}),null)
 assert.equal(eventMenuForRace({raceName:'Heartbeat Ultra',raceDate:date}),menu)
 const generic=buildRunnerFocus({checkpoints,completed:2,gelEvents:[],aidEvents:[]})
 const scoped=buildRunnerFocus({checkpoints,completed:2,gelEvents:[],aidEvents:[],eventMenu:menu})
 assert.equal(generic.meal.foodAvailableAtEvent,false)
 assert.equal(scoped.meal.foodAvailableAtEvent,true)
 assert.equal(generic.meal.plannedFoodCarbsG,0)
 assert.equal(scoped.meal.plannedFoodCarbsG,0)
})
test('planner shows self-serve fixed Drink Mix 160 but requires user-planned volume and explicit save',()=>{
 const ui=read('src/components/GelInventoryPlanner.tsx')
 const runner=read('src/components/RaceRunnerFocus.tsx')
 const menuCode=read('src/lib/raceEventMenu.mjs')
 assert.match(ui,/gip-mix-confirmed/)
 assert.match(ui,/MAURTEN Drink Mix 160 · frei am Versorgungsstopp/)
 assert.match(ui,/0 = noch offen/)
 assert.match(ui,/250 ml entsprechen bei Standardmischung etwa 20 g KH/)
 assert.match(ui,/setSettingsDirty\(Boolean\(confirmed160/)
 assert.match(ui,/eventMenu\.carbs\.join/)
 assert.match(ui,/setSettingsDirty\(false\)/)
 assert.match(ui,/if\(!onAidScheduleChange\|\|settingsDirty\)return/)
 assert.match(runner,/view.meal.foodAvailableAtEvent/)
 assert.match(menuCode,/eventMenuForRace/)
 assert.doesNotMatch(ui,/automatisch verbucht.*500 ml/)
 assert.doesNotMatch(runner,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
})

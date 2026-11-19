import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'
import {buildAidPlan} from '../src/lib/raceAidPlan.mjs'
import {buildGelPlan} from '../src/lib/gelTiming.mjs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const race=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
 paceSeconds:null,targetHours:15,carbsGPerHour:75,fluidMlPerHour:500,
 sodiumMgPerHour:500})
const settings={aid_confirmed:true,aid_every_laps:1,aid_drink_mix:'160',
 aid_drink_ml_per_stop:250,aid_custom_carbs_g_per_500:0,
 aid_food_name:'Verträgliche Banane',aid_food_carbs_g_per_stop:20}
const owned=[{id:'energy50',brand:'226ERS',name:'High Energy 76 g',carbsG:50,
 caffeineMg:0,quantity:30,priority:1},
 {id:'caf100',brand:'Maurten',name:'Gel 100 Caf 100',carbsG:25,
 caffeineMg:100,quantity:2,priority:1}]
test('heartbeat 112 km time plan has 18 full laps and a short final segment',()=>{
 assert.equal(race.status,'ready')
 assert.equal(race.checkpoints.length,19)
 assert.equal(race.checkpoints[0].moveMinutes,42)
 assert.equal(race.checkpoints[0].pauseMinutes,3)
 assert.equal(race.checkpoints[0].departureMinutes,45)
 assert.equal(race.checkpoints[2].pauseMinutes,11)
 assert.equal(race.checkpoints.at(-1).legDistanceKm,4)
 assert.equal(race.checkpoints.at(-1).pauseMinutes,0)
})
test('on-course Maurten Drink Mix 160 plus actual food changes gel requirement',()=>{
 const aid=buildAidPlan({checkpoints:race.checkpoints,settings,startTime:'06:00'})
 assert.equal(aid.status,'ready')
 assert.equal(aid.events.length,18)
 assert.equal(aid.events[0].minute,42)
 assert.equal(aid.events[0].clock,'06:42')
 assert.equal(aid.events[0].drinkCarbsG,20)
 assert.equal(aid.events[0].foodCarbsG,20)
 assert.equal(aid.drinkCarbsG,360)
 assert.equal(aid.foodCarbsG,360)
 assert.equal(aid.totalCarbsG,720)
 assert.equal(aid.fluidMl,4500)
 assert.equal(aid.events.some(e=>e.round===19),false)
 const pure=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,
  inventory:owned,allowCaffeine:false})
 const combined=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,
  inventory:owned,aidEvents:aid.events,allowCaffeine:false})
 assert.ok(combined.events.length<pure.events.length)
 assert.ok(combined.plannedCarbsG<pure.plannedCarbsG)
 assert.equal(combined.aidCarbsG,720)
 assert.equal(combined.requestedGelCarbsG,387.5)
 assert.equal(combined.totalTargetCarbsG,1107.5)
 assert.ok(combined.totalPlannedCarbsG>=combined.aidCarbsG)
})
test('Drink Mix 320 differs; no confirmed concentration or food means no fake carbohydrate',()=>{
 const without=buildAidPlan({checkpoints:race.checkpoints,
  settings:{...settings,aid_confirmed:false}})
 assert.equal(without.totalCarbsG,0)
 assert.equal(without.events.length,0)
 const unknown=buildAidPlan({checkpoints:race.checkpoints,
  settings:{...settings,aid_drink_mix:'unknown'}})
 assert.equal(unknown.status,'unknown-concentration')
 assert.equal(unknown.totalCarbsG,0)
 const other=buildAidPlan({checkpoints:race.checkpoints,
  settings:{...settings,aid_drink_mix:'320'}})
 assert.equal(other.events[0].drinkCarbsG,40)
 assert.equal(other.totalCarbsG,1080)
 const invalidFood=buildAidPlan({checkpoints:race.checkpoints,
  settings:{...settings,aid_food_name:''}})
 assert.equal(invalidFood.status,'unknown-food')
 assert.equal(invalidFood.totalCarbsG,0)
})
test('a planned caffeine gel cannot appear before its selected time or exceed its cap',()=>{
 const off=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,
  inventory:owned,allowCaffeine:false,caffeineStartMinute:360,caffeineMaxMg:100})
 assert.ok(off.events.every(e=>e.caffeineMg===0))
 const limited=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,
  inventory:owned,allowCaffeine:true,caffeineStartMinute:360,caffeineMaxMg:100})
 assert.ok(limited.caffeineMg<=100)
 assert.ok(limited.events.filter(e=>e.caffeineMg>0).every(e=>e.minute>=360))
 assert.ok(limited.events.every(e=>!e.brand.includes('Red Bull')))
 const noCaffeine=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,
  inventory:owned,allowCaffeine:true,caffeineStartMinute:360,caffeineMaxMg:0})
 assert.ok(noCaffeine.events.every(e=>e.caffeineMg===0))
})
test('next round only includes its own confirmed aid, never whole race or invented intake',()=>{
 const aid=buildAidPlan({checkpoints:race.checkpoints,settings,startTime:'06:00'})
 const one=buildRunnerFocus({checkpoints:race.checkpoints,completed:0,aidEvents:aid.events})
 assert.equal(one.nextIndex,1)
 assert.equal(one.nextAid.round,1)
 assert.equal(one.nextAid.drinkMl,250)
 assert.equal(one.nextAid.carbsG,40)
 const later=buildRunnerFocus({checkpoints:race.checkpoints,completed:3,aidEvents:aid.events})
 assert.equal(later.nextAid.round,4)
 const finish=buildRunnerFocus({checkpoints:race.checkpoints,completed:18,aidEvents:aid.events})
 assert.equal(finish.nextAid,null)
})
test('race UI has pause/run/departure columns and compact runner with event food',()=>{
 const timeline=read('src/components/RaceDayCockpit.tsx')
 const runner=read('src/components/RaceRunnerFocus.tsx')
 const planner=read('src/components/GelInventoryPlanner.tsx')
 const strategy=read('src/components/RaceStrategyCard.tsx')
 const migration=read('supabase/migrations/20261119150000_race_aid_and_caffeine_v112.sql')
 assert.match(timeline,/Laufzeit Soll/)
 assert.match(timeline,/Pause Soll/)
 assert.match(timeline,/Weiter bei · Soll/)
 assert.match(timeline,/r\.pauseMinutes/)
 assert.match(timeline,/clockAt\(startTime,r\.departureMinutes\)/)
 assert.match(runner,/view\.nextAid/)
 assert.match(runner,/Eine Runde nach der anderen/)
 assert.match(runner,/Koffein:/)
 assert.match(planner,/aid_confirmed/)
 assert.match(planner,/Koffein-Gels aus deinem Vorrat/)
 assert.match(planner,/setSettingsDirty\(false\)/)
 assert.match(strategy,/aidSchedule=\{aidSchedule\}/)
 assert.match(migration,/ADD COLUMN IF NOT EXISTS aid_confirmed/)
 assert.match(migration,/ADD COLUMN IF NOT EXISTS caffeine_start_minute/)
 assert.doesNotMatch(runner,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b/)
 assert.doesNotMatch(runner,/fetch\(|localStorage|navigator\.geolocation/)
})

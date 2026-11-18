import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildGelPlan,clockAt} from '../src/lib/gelTiming.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const gel=(id,carbsG,quantity=20,priority=1,caffeineMg=0,extra={})=>({
 id,brand:'Maurten',name:id,carbsG,quantity,priority,caffeineMg,...extra
})
test('1100g of 75g/h is scheduled as 20-min checks with actual owned inventory only',()=>{
 const owned=[gel('m100',25,40),gel('h76',50,30)]
 const copy=JSON.stringify(owned)
 const plan=buildGelPlan({durationMinutes:886,targetCarbsGPerHour:75,inventory:owned,startTime:'06:00'})
 assert.equal(plan.status,'ready')
 assert.ok(plan.events.length>10)
 assert.equal(plan.events[0].minute,20)
 assert.equal(plan.events[0].clock,'06:20')
 assert.equal(plan.requestedGelCarbsG,1107.5)
 assert.equal(plan.plannedKcal,plan.plannedCarbsG*4)
 assert.equal(JSON.stringify(owned),copy)
 const usedById=Object.fromEntries(plan.used.map(x=>[x.id,x.quantity]))
 assert.ok((usedById.m100||0)<=40&&(usedById.h76||0)<=30)
 assert.ok(plan.plannedCarbsG<=plan.requestedGelCarbsG+50)
})
test('favorites and acceptable gels are eligible; emergency gels are not used automatically',()=>{
 const items=[gel('reserve',50,20,3),gel('preferred',25,5,1)]
 const plan=buildGelPlan({durationMinutes:180,targetCarbsGPerHour:75,inventory:items})
 assert.ok(plan.events.length>0)
 assert.ok(plan.events.every(x=>x.id==='preferred'))
 assert.equal(plan.reserve[0].id,'reserve')
 assert.ok(plan.uncoveredG>0)
})
test('drinks reduce required gel carbohydrates; drinks are not silently assumed',()=>{
 const inventory=[gel('m100',25,40)]
 const a=buildGelPlan({durationMinutes:180,targetCarbsGPerHour:75,inventory})
 const b=buildGelPlan({durationMinutes:180,targetCarbsGPerHour:75,drinkCarbsGPerHour:50,inventory})
 assert.equal(a.requestedGelCarbsG,225)
 assert.equal(b.requestedGelCarbsG,75)
 assert.ok(b.events.length<a.events.length)
})
test('no owned gels means no invented timing or consumption',()=>{
 const plan=buildGelPlan({durationMinutes:900,targetCarbsGPerHour:75,inventory:[]})
 assert.equal(plan.events.length,0)
 assert.equal(plan.plannedCarbsG,0)
 assert.equal(plan.uncoveredG,1125)
})
test('caffeine is opt-in, capped, and SiS Nootropics never scheduled twice',()=>{
 const inventory=[gel('nootropics',40,10,1,200,{name:'BETA Fuel + Nootropics Gel'})]
 const off=buildGelPlan({durationMinutes:900,targetCarbsGPerHour:75,inventory})
 assert.equal(off.events.length,0)
 const on=buildGelPlan({durationMinutes:900,targetCarbsGPerHour:75,inventory,allowCaffeine:true})
 assert.equal(on.events.length,1)
 assert.equal(on.caffeineMg,200)
})
test('bulk gel mix and unverified carb products cannot be scheduled as one standard gel',()=>{
 const inventory=[gel('mix',120,2,1,0,{isBulk:true}),gel('unknown',NaN,10),gel('yes',25,3)]
 const plan=buildGelPlan({durationMinutes:180,targetCarbsGPerHour:75,inventory})
 assert.ok(plan.events.every(e=>e.id==='yes'))
})
test('clock wrap, bad inputs, and deterministic planning',()=>{
 assert.equal(clockAt('23:50',30),'00:20')
 assert.equal(clockAt('bad',30),null)
 assert.equal(buildGelPlan({durationMinutes:null,targetCarbsGPerHour:75}).status,'invalid')
 const args={durationMinutes:120,targetCarbsGPerHour:75,inventory:[gel('a',25,20)]}
 assert.deepEqual(buildGelPlan(args),buildGelPlan(args))
})
test('the Race Prep UI provides product inventory, priority and per-event settings securely',()=>{
 const component=read('src/components/GelInventoryPlanner.tsx')
 const race=read('src/components/RaceStrategyCard.tsx')
 const schema=read('supabase/migrations/20261118110000_garmin_gel_inventory_v0992.sql')
 const prefs=read('supabase/migrations/20261118111000_garmin_gel_plan_settings_v0992.sql')
 assert.match(race,/<GelInventoryPlanner active=\{active\}/)
 for(const name of ['Maurten','SiS','226ERS','Eigene'])assert.ok(component.includes(name))
 assert.match(component,/\.from\('garmin_gel_inventory'\)/)
 assert.match(component,/\.eq\('user_id',userId\)/)
 assert.match(component,/priority:Number/)
 assert.match(component,/Notfallreserve/)
 assert.match(component,/allow_caffeine/)
 assert.match(component,/\.upsert\(payload,\{onConflict:'user_id,race_date,race_name'\}\)/)
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/)
 assert.match(schema,/user_id=\(select auth.uid\(\)\)/)
 assert.match(schema,/REVOKE ALL ON public.garmin_gel_catalog FROM anon,authenticated/)
 assert.match(prefs,/ENABLE ROW LEVEL SECURITY/)
 assert.doesNotMatch(component,/service_role|localStorage|postToGarmin/)
})

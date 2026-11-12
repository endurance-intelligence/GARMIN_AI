import test from 'node:test'
import assert from 'node:assert/strict'
import {coachAddDays,coachMonday,buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const day=(i)=>coachAddDays('2026-11-12',i)
const metrics=Array.from({length:18},(_,i)=>({metric_date:coachAddDays('2026-11-12',i-17),
  hrv_ms:48,resting_heart_rate:42,sleep_seconds:7.5*3600}))
const fixture=()=>({
 today:'2026-11-12',
 health:{metrics,training:{runKm7:40,previousRunKm7:38,historyStatus:'complete',truncated:false}},
 boards:[{activities:[],manual:[]}],
 options:{options:[{code:'track',weekday:6,enabled:true,title:'ORC Track'}],choices:[]},
 plans:{entries:[]},goal:{goal:{race_date:'2026-11-21',race_name:'Heartbeat Ultra Fulda'}},symptoms:false
})
test('date math handles daylight-saving transitions and week starts',()=>{
 assert.equal(coachAddDays('2026-03-28',2),'2026-03-30')
 assert.equal(coachMonday('2026-11-12'),'2026-11-09')
})
test('taper week contains seven dated suggestions, never adds intensity',()=>{
 const plan=buildSevenDayCoach(fixture())
 assert.equal(plan.days.length,7)
 assert.deepEqual(plan.days.map(x=>x.date),Array.from({length:7},(_,i)=>day(i)))
 assert.ok(plan.days.every(x=>!['intervals','tempo','quality'].includes(x.kind)))
 assert.ok(plan.days.find(x=>x.kind==='option'))
 assert.ok(plan.days.some(x=>x.kind==='easy'&&x.approvable))
})
test('illness or pain inhibits every proposed workout approval',()=>{
 const data=fixture();data.symptoms=true
 const result=buildSevenDayCoach(data)
 assert.ok(result.days.every(x=>!x.approvable))
})
test('existing plans and actual Garmin activity are never duplicated',()=>{
 const data=fixture()
 data.plans.entries=[{training_date:day(1),state:'pending',title:'Eigene Einheit',sport:'running'}]
 data.boards=[{activities:[{start_time_local:day(2)+'T08:00:00',sport_type:'running'}],manual:[]}]
 const result=buildSevenDayCoach(data)
 assert.equal(result.days[1].kind,'existing')
 assert.equal(result.days[2].kind,'completed')
 assert.equal(result.days[1].approvable,false)
})
test('selected club attendance remains optional and is not converted to a new workout',()=>{
 const data=fixture()
 data.options.choices=[{option_code:'track',training_date:day(2),choice:'selected'}]
 data.options.options[0].weekday=6
 data.options.choices[0].training_date=day(2)
 const actualDay=coachAddDays(day(0),2)
 // 2026-11-14 = Saturday
 assert.equal(actualDay,'2026-11-14')
 assert.equal(buildSevenDayCoach(data).days[2].kind,'chosen')
})
test('missing training history cannot produce an approvable workout',()=>{
 const data=fixture();data.health.training=null
 assert.ok(buildSevenDayCoach(data).days.every(x=>!x.approvable))
})
test('on race day plan cannot add an additional workout',()=>{
 const data=fixture();data.today='2026-11-21'
 data.goal.goal.race_date='2026-11-21'
 assert.equal(buildSevenDayCoach(data).days[0].kind,'race')
 assert.equal(buildSevenDayCoach(data).days[0].approvable,false)
})

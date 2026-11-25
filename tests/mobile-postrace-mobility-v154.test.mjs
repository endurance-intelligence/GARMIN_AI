import test from 'node:test'
import assert from 'node:assert/strict'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
import {quickCoachAction} from '../src/lib/calendarQuickAccept.mjs'

const race='2026-11-21',today='2026-11-25'
const sample=(check=null)=>({
 today,health:{metrics:Array.from({length:19},(_,i)=>({
  metric_date:coachAddDays(today,i-18),hrv_ms:50,resting_heart_rate:43,sleep_seconds:27000
 })),training:{runKm7:50,previousRunKm7:40,historyStatus:'complete',truncated:false}},
 boards:[{activities:[{activity_id:'race',activity_name:'Ultra',start_time_local:race+' 06:00:00',
  sport_type:'running',duration_s:36000,distance_m:50000}],manual:[]}],
 options:{options:[],choices:[]},plans:{entries:[]},
 goal:{goal:{race_date:race,race_name:'Ultra',distance_km:50}},
 life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[],day_decisions:[],
  race_recovery_checks:check?[check]:[],post_workout_feedback:[]},runs:[]}
})
const check=(fatigue,soreness,warning=false,reportedOn=today)=>({raceDate:race,raceName:'Ultra',reportedOn,fatigue,soreness,warning})
const day=input=>buildSevenDayCoach(input).days[0]
test('day four after matched ultra can offer conditional light core, without forcing barometer',()=>{
 const input=sample(),plan=buildSevenDayCoach(input),d=plan.days[0]
 assert.equal(plan.autoRaceRecovery.status,'matched')
 assert.equal(d.kind,'mobility')
 assert.equal(d.minutes,10)
 assert.equal(d.approvable,true)
 assert.match(d.reason,/beschwerdefrei/)
 assert.match(d.reason,/Kein reguläres Stabi-Workout/)
 assert.equal(quickCoachAction(plan,today,today),'draft')
 assert.ok(plan.days.every(x=>!['long','quality','intervals','tempo'].includes(x.kind)))
})
test('no new workout on first two days or on existing, completed, blocked or sick days',()=>{
 for(const offset of [1,2]){
  const i=sample();i.today=coachAddDays(race,offset)
  assert.notEqual(day(i).kind,'mobility')
 }
 for(const mutate of [
  x=>x.plans.entries.push({training_date:today,state:'draft',title:'Existing'}),
  x=>x.boards[0].manual.push({session_date:today,title:'Done'}),
  x=>x.life.context.blocked_periods.push({start:today,end:today,reason:'other'}),
  x=>{x.life.context.illness_state='sick'},
  x=>{x.symptoms=true}
 ]){
  const i=sample();mutate(i);assert.equal(day(i).approvable,false)
 }
})
test('high fatigue, warning, stale high fatigue, incomplete or adverse Garmin evidence never unlock core',()=>{
 for(const c of [check(8,2),check(4,4),check(1,1,true),check(8,8,false,'2026-11-22'),check(1,1,true,'2026-11-22')]){
  assert.equal(day(sample(c)).approvable,false)
 }
 for(const mutate of [
  x=>{x.health.metrics=[]},
  x=>{x.health.metrics.at(-1).hrv_ms=20},
  x=>{x.health.training.truncated=true},
  x=>{x.boards[0].activities=[]}
 ]){
  const i=sample(check(1,1));mutate(i);assert.notEqual(day(i).kind,'mobility')
 }
})
test('recent archived race retains recovery and a selected group does not become an extra session',()=>{
 const i=sample(check(1,1))
 i.racePortfolio={others:[i.goal.goal]}
 i.goal={goal:{race_date:'2027-04-25',race_name:'Next',distance_km:31}}
 assert.equal(day(i).kind,'mobility')
 i.options={options:[{enabled:true,weekday:3,code:'orc',title:'ORC Run',sport:'running'}],
 choices:[{training_date:today,option_code:'orc',choice:'selected'}]}
 const d=day(i);assert.equal(d.approvable,false);assert.equal(d.selectedGroup.advice,'skip')
})
test('future preview does not convert recovery into hard or additional scheduled training',()=>{
 const p=buildSevenDayCoach(sample(check(1,1)))
 assert.ok(p.days.filter(d=>d.kind==='mobility').length<=3)
 assert.ok(p.days.filter(d=>d.kind==='mobility').every(d=>d.minutes===10))
 assert.ok(p.days.every(d=>!['long','quality','intervals','tempo'].includes(d.kind)))
})

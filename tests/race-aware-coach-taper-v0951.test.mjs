import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {coachAddDays,buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-13',start='2026-11-16',race='2026-11-21'
const metrics=Array.from({length:20},(_,i)=>({
 metric_date:coachAddDays(today,i-19),hrv_ms:48,resting_heart_rate:42,sleep_seconds:27000
}))
const fixture=()=>({
 today,startDate:start,
 health:{metrics,training:{runKm7:38,previousRunKm7:40,historyStatus:'complete',truncated:false}},
 boards:[{start:'2026-11-09',activities:[],manual:[]},
         {start:'2026-11-16',activities:[],manual:[]}],
 options:{
  options:[{code:'football',weekday:1,enabled:true,title:'Fußball'},
   {code:'track',weekday:2,enabled:true,title:'ORC Track'},
   {code:'run',weekday:3,enabled:true,title:'ORC Run'},
   {code:'track_sat',weekday:6,enabled:true,title:'ORC Track'}],
  choices:[{option_code:'track',training_date:'2026-11-17',choice:'selected'}]
 },
 plans:{entries:[{training_date:'2026-11-15',title:'Lockerer Lauf',state:'pending'}]},
 goal:{goal:{race_name:'Heartbeat Ultra Fulda',race_date:race,
  race_start_time:'06:00:00',race_location:'Fulda',distance_km:112,target_hours:15}},
 life:{context:{illness_state:'well',return_started_on:null,blocked_periods:[],run_reviews:[]},runs:[]}
})
test('Coach schedules ACTUAL visible race week, 16 through 22 Nov, not rolling 13 through 19',()=>{
 const x=buildSevenDayCoach(fixture())
 assert.equal(x.days.length,7)
 assert.deepEqual(x.days.map(y=>y.date),['2026-11-16','2026-11-17','2026-11-18',
  '2026-11-19','2026-11-20','2026-11-21','2026-11-22'])
 assert.equal(x.raceDate,race)
 assert.equal(x.days[0].kind,'recovery')
 assert.match(x.days[0].title,/Fußball auslassen/)
 assert.equal(x.days[1].kind,'easy')
 assert.equal(x.days[1].minutes,30)
 assert.match(x.days[1].title,/statt Intervallen/)
 assert.equal(x.days[2].kind,'easy')
 assert.equal(x.days[2].minutes,25)
 assert.match(x.days[2].title,/statt vollem ORC Run/)
 assert.ok(x.days.slice(3,5).every(x=>x.kind==='recovery'&&!x.approvable))
 assert.equal(x.days[5].kind,'race')
 assert.match(x.days[5].title,/Heartbeat Ultra Fulda.*112 km/)
 assert.match(x.days[5].reason,/Start 06:00 Uhr/)
 assert.match(x.days[5].reason,/Fulda/)
 assert.equal(x.days[5].approvable,false)
 assert.equal(x.days[6].kind,'recovery')
 assert.ok(!x.days.some(y=>y.kind==='option'||y.kind==='chosen'||y.kind==='long'))
})
test('selected ORC interval/football/track options never override the race taper decision',()=>{
 const d=fixture()
 d.options.choices.push({option_code:'track_sat',training_date:race,choice:'selected'})
 const result=buildSevenDayCoach(d)
 assert.equal(result.days[1].kind,'easy')
 assert.equal(result.days[5].kind,'race')
 assert.ok(!result.days.find(x=>x.kind==='option'||x.kind==='chosen'))
})
test('if the athlete is sick or blocks the day no approvable workout is created',()=>{
 const d=fixture()
 d.life.context.illness_state='sick'
 assert.ok(buildSevenDayCoach(d).days.every(x=>!x.approvable))
 d.life.context.illness_state='well'
 d.life.context.blocked_periods=[{start:'2026-11-17',end:'2026-11-18',reason:'vacation'}]
 const plan=buildSevenDayCoach(d)
 assert.equal(plan.days[1].kind,'blocked')
 assert.equal(plan.days[2].kind,'blocked')
 assert.equal(plan.days[5].kind,'race')
})
test('incomplete real training evidence and concerning recovery signs block taper workout approval',()=>{
 const d=fixture()
 d.health.training=null
 assert.ok(buildSevenDayCoach(d).days.every(x=>!x.approvable))
 d.health.training={runKm7:50,previousRunKm7:25,historyStatus:'complete',truncated:false}
 assert.ok(buildSevenDayCoach(d).days.every(x=>!x.approvable))
})
test('stored plans and actual activities cannot be accidentally duplicated',()=>{
 const d=fixture()
 d.plans.entries.push({training_date:'2026-11-17',title:'Already approved',state:'pending'})
 assert.equal(buildSevenDayCoach(d).days[1].kind,'existing')
 d.plans.entries.pop()
 d.boards[1].activities.push({start_time_local:'2026-11-17T07:30:00',sport_type:'running'})
 assert.equal(buildSevenDayCoach(d).days[1].kind,'completed')
})
test('ultra postrace days require recovery rather than automatically prescribing new training',()=>{
 const d=fixture()
 d.startDate='2026-11-22'
 const result=buildSevenDayCoach(d)
 assert.equal(result.days[0].kind,'recovery')
 assert.equal(result.days[6].kind,'recovery')
 assert.ok(result.days.every(x=>!x.approvable))
})
test('different race date works without hardcoding November 2026 in coach implementation',()=>{
 const d=fixture()
 d.today='2027-05-01';d.startDate='2027-05-03'
 d.goal.goal.race_date='2027-05-08'
 d.health.metrics=metrics.map((x,i)=>({...x,metric_date:coachAddDays(d.today,i-19)}))
 const result=buildSevenDayCoach(d)
 assert.equal(result.days[5].kind,'race')
 assert.equal(result.days[5].date,'2027-05-08')
})
test('calendar uses same target week throughout planning, optional club slots and goal hierarchy',()=>{
 const calendar=file('src/pages/CalendarPage.tsx')
 const board=file('src/components/CalendarWeekBoard.tsx')
 const snap=file('src/lib/coachSnapshot.ts')
 const api=file('supabase/functions/garmin-training-plan/index.ts')
 assert.match(calendar,/const planStart=week>0\?start:today/)
 assert.match(calendar,/const horizonDay=moveDay\(planStart,6\)/)
 assert.match(calendar,/today,startDate:planStart/)
 assert.match(calendar,/loadCoachSnapshot\(session,today,controller\.signal,start\)/)
 assert.match(calendar,/raceInWeek=coachPlan\?\.days\.find\(d=>d\.kind==='race'\)/)
 assert.match(calendar,/HAUPTZIEL \/ RENNTAG/)
 assert.match(snap,/const visible=visibleWeek\?coachMonday\(visibleWeek\):first/)
 assert.match(snap,/const weeks=\[\.\.\.new Set\(\[first,second,visible\]\)\]/)
 assert.match(board,/candidate\?\.kind!=='race'/)
 assert.match(board,/RENNTAG \/ HAUPTZIEL/)
 assert.match(board,/is-coach\.is-race|is-race/)
 assert.match(board,/COACH RÄT AB/)
 assert.match(api,/\+13\*86400000/)
 assert.match(api,/coachWorkoutAllowed\(context,input\.kind,input\.date\)/)
})

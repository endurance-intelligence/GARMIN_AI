import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-12'
const date=n=>coachAddDays(today,n)
const fixture=()=>({
 today,
 health:{training:{runKm7:35,previousRunKm7:34,historyStatus:'complete',truncated:false},
 metrics:Array.from({length:18},(_,i)=>({metric_date:date(i-17),hrv_ms:48,
 resting_heart_rate:42,sleep_seconds:7.5*3600}))},
 boards:[{activities:[],manual:[]}],
 options:{options:[{code:'track',weekday:6,enabled:true,title:'ORC Track'}],choices:[]},
 plans:{entries:[]},goal:{goal:{race_date:'2027-03-01',race_name:'Frühjahrslauf'}},
 life:{context:{illness_state:'well',illness_started_on:null,return_started_on:null,
 blocked_periods:[],run_reviews:[]},runs:[]}
})
const run=(id,offset)=>({activity_id:id,start_time_local:date(offset)+'T09:00:00',
 sport_type:'running',distance_m:3500,duration_s:1500,average_heart_rate:128,rpe_raw:3})
test('illness is durable and blocks ALL coach plans even when an old calendar draft exists',()=>{
 const d=fixture()
 d.life.context.illness_state='sick'
 d.plans.entries=[{training_date:date(0),title:'Geplante Intervalle',sport:'running',state:'pending'}]
 const result=buildSevenDayCoach(d)
 assert.equal(result.ill,true)
 assert.ok(result.days.every(x=>x.kind==='illness'&&!x.approvable))
 assert.match(result.days[0].reason,/Vorhandenen Kalendertermin/)
})
test('first self-reported symptom-free day offers only ONE brief initial return attempt',()=>{
 const d=fixture();d.life.context.illness_state='returning'
 d.life.context.return_started_on=today
 const result=buildSevenDayCoach(d)
 const approvals=result.days.filter(x=>x.approvable)
 assert.equal(approvals.length,1)
 assert.equal(approvals[0].kind,'return_easy')
 assert.equal(approvals[0].minutes,15)
 assert.ok(!result.days.some(x=>x.kind==='option'))
})
test('first real return run must be reviewed before another run is proposed',()=>{
 const d=fixture();d.life.context.illness_state='returning'
 d.life.context.return_started_on=date(-3);d.life.runs=[run('garmin-1',-2)]
 let result=buildSevenDayCoach(d)
 assert.equal(result.days.filter(x=>x.approvable).length,0)
 d.life.context.run_reviews=[{activityId:'garmin-1',assessment:'ok',reviewedOn:date(-1)}]
 result=buildSevenDayCoach(d)
 assert.equal(result.days.filter(x=>x.approvable).length,1)
 assert.equal(result.days.find(x=>x.approvable).minutes,25)
})
test('symptoms during return suspend all proposals; two reviewed runs do not auto-clear return mode',()=>{
 const d=fixture();d.life.context.illness_state='returning'
 d.life.context.return_started_on=date(-8)
 d.life.runs=[run('one',-6),run('two',-3)]
 d.life.context.run_reviews=[{activityId:'one',assessment:'ok',reviewedOn:date(-5)},
 {activityId:'two',assessment:'ok',reviewedOn:date(-2)}]
 let result=buildSevenDayCoach(d)
 assert.equal(result.acknowledgedRuns,2)
 assert.ok(result.days.every(x=>!x.approvable))
 assert.equal(result.returning,true)
 d.life.context.run_reviews[1].assessment='concern'
 result=buildSevenDayCoach(d)
 assert.equal(result.concern,true)
 assert.ok(result.days.every(x=>!x.approvable))
})
test('vacation and unavailable ranges block every date including club options, without make-up workouts',()=>{
 const d=fixture()
 d.life.context.blocked_periods=[
 {id:'trip',start:date(0),end:date(3),reason:'vacation'},
 {id:'busy',start:date(6),end:date(6),reason:'unavailable'}]
 const result=buildSevenDayCoach(d)
 assert.deepEqual(result.days.slice(0,4).map(x=>x.kind),['blocked','blocked','blocked','blocked'])
 assert.equal(result.days[6].kind,'blocked')
 assert.ok(result.days.filter(x=>x.kind==='blocked').every(x=>!x.approvable))
 assert.equal(result.days[4].date,date(4))
})
test('calendar conflict in a blocked range warns but never deletes existing workout',()=>{
 const d=fixture()
 d.life.context.blocked_periods=[{id:'1',start:date(1),end:date(2),reason:'unavailable'}]
 d.plans.entries=[{training_date:date(1),title:'Already scheduled',state:'pending'}]
 assert.match(buildSevenDayCoach(d).days[1].reason,/Bereits geplanter Termin bleibt bestehen/)
})
test('frontend must fail closed if protected life context cannot load',()=>{
 const ui=read('src/components/CoachSevenDay.tsx')
 const controls=read('src/components/CoachLifeContext.tsx')
 const edge=read('supabase/functions/garmin-coach-context/index.ts')
 const schema=read('supabase/migrations/20261112110000_coach_illness_unavailable_v11.sql')
 assert.match(ui,/get\('garmin-coach-context'\)/)
 assert.match(ui,/if\(!life\.context/)
 assert.match(ui,/life:snapshot\.life/)
 assert.match(ui,/contextBusy/)
 assert.match(controls,/start_illness/)
 assert.match(controls,/start_return/)
 assert.match(controls,/review_run/)
 assert.match(controls,/finish_return/)
 assert.match(controls,/add_block/)
 assert.match(controls,/remove_block/)
 assert.match(edge,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.match(edge,/user\.email_confirmed_at/)
 assert.match(edge,/row\.illness_state!=='returning'/)
 assert.match(edge,/garminChanged:false,intervalsChanged:false/)
 assert.match(schema,/enable row level security/)
 assert.match(schema,/revoke all .* from anon, authenticated/)
})

test('after two good return runs normal mode still starts conservatively, never jumps straight to long run',()=>{
 const d=fixture()
 d.life.context.illness_state='well'
 d.life.context.return_started_on=date(-4)
 const result=buildSevenDayCoach(d)
 assert.equal(result.postIllness,true)
 assert.ok(result.days.every(x=>x.kind!=='long'))
 assert.ok(result.days.filter(x=>x.approvable).every(x=>x.kind==='easy'&&x.minutes<=35))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
import {selectCoachDecision} from '../src/lib/coachDecision.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-24',race='2026-11-21'
const sample=(check=null)=>({
 today,health:{metrics:Array.from({length:18},(_,i)=>({
  metric_date:coachAddDays(today,i-17),hrv_ms:49,resting_heart_rate:43,sleep_seconds:27400
 })),training:{runKm7:12,previousRunKm7:20,historyStatus:'complete',truncated:false}},
 boards:[{activities:[],manual:[]}],options:{options:[],choices:[]},
 plans:{entries:[]},goal:{goal:{race_date:race,race_name:'Ultra Fulda',distance_km:112}},
 life:{context:{illness_state:'well',return_started_on:null,blocked_periods:[],run_reviews:[],
  day_decisions:[],race_recovery_checks:check?[check]:[]},runs:[]}
})
const check=(fatigue,soreness,warning=false,reportedOn=today)=>({
 raceDate:race,raceName:'Ultra Fulda',reportedOn,fatigue,soreness,warning
})
test('seven distinct days can be selected; spotlight derives facts for selected day',()=>{
 const plan=buildSevenDayCoach(sample())
 assert.equal(plan.days.length,7)
 const selected=selectCoachDecision(plan,{selectedDate:coachAddDays(today,5)})
 assert.equal(selected.day.date,coachAddDays(today,5))
 assert.equal(selectCoachDecision(plan).day.date,today)
 const nav=read('src/components/CoachSevenDay.tsx')
 assert.match(nav,/plan\.days\.map\(day=><button type="button" key=\{day.date\} role="tab"/)
 assert.match(nav,/setSelectedDay\(day.date\)/)
 assert.match(nav,/plan\.days\.filter\(day=>day.date===selectedDay/)
 assert.match(read('src/styles/coach-seven-day.css'),/overflow-x:auto;scroll-snap-type:x proximity/)
})
test('explicit decline and accept are persisted as user decisions, never as calendar blocks',()=>{
 const d=sample(); d.goal.goal.race_date='2027-03-01'
 d.life.context.day_decisions=[{date:today,choice:'declined'},
  {date:coachAddDays(today,1),choice:'accepted'}]
 const result=buildSevenDayCoach(d)
 const original=sample()
 original.goal.goal.race_date='2027-03-01'
 const unchanged=buildSevenDayCoach(original)
 assert.equal(result.days[0].kind,unchanged.days[0].kind)
 assert.equal(result.days[1].kind,unchanged.days[1].kind)
 assert.equal(result.days[0].title,unchanged.days[0].title)
 assert.equal(result.days[1].title,unchanged.days[1].title)
 assert.equal(result.days[0].decision,'declined')
 assert.equal(result.days[1].decision,'accepted')
 assert.equal(result.days[0].approvable,false)
 assert.equal(result.days[1].approvable,false)
 const endpoint=read('supabase/functions/garmin-coach-context/index.ts')
 assert.match(endpoint,/input\.action==='set_day_decision'/)
 assert.match(endpoint,/day_decisions:input\.choice==='open'\?other/)
 assert.match(endpoint,/row\.day_decisions/)
 assert.match(endpoint,/user\.email.*owner/)
})
test('post-race recovery without a check-in asks for one rather than fabricating readiness',()=>{
 const p=buildSevenDayCoach(sample())
 assert.equal(p.days[0].kind,'recovery')
 assert.match(p.days[0].title,/Check-in fehlt/)
 assert.ok(p.days.every(d=>!d.approvable))
 assert.equal(p.reportedExhaustion,null)
 assert.ok(!p.days.some(d=>d.kind==='blocked'))
})
test('fatigue report 8 of 10 suppresses new running advice',()=>{
 const p=buildSevenDayCoach(sample(check(8,5)))
 assert.equal(p.reportedExhaustion,8)
 assert.equal(p.days[0].kind,'recovery')
 assert.match(p.days[0].reason,/8\/10/)
 assert.ok(!p.days.some(d=>d.approvable))
})
test('even low fatigue requires several easy ultra recovery days, then only short easy runs',()=>{
 const p=buildSevenDayCoach(sample(check(2,3)))
 assert.equal(p.days[0].kind,'recovery')
 assert.equal(p.days[1].kind,'recovery')
 assert.equal(p.days[2].kind,'recovery')
 assert.equal(p.days[3].kind,'easy')
 assert.equal(p.days[3].minutes,20)
 assert.ok(p.days.every(d=>!['intervals','long','tempo','quality'].includes(d.kind)))
})
test('stale check-ins and self-reported warning signs never greenlight exercise',()=>{
 const stale=buildSevenDayCoach(sample(check(1,1,false,'2026-11-21')))
 assert.match(stale.days[0].title,/Check-in fehlt/)
 const warning=buildSevenDayCoach(sample(check(1,2,true)))
 assert.equal(warning.days[0].kind,'illness')
 assert.ok(warning.days.every(d=>!d.approvable))
})
test('real pre-existing training still takes precedence over fresh suggested sessions',()=>{
 const d=sample(check(2,2))
 d.plans.entries=[{training_date:today,state:'draft',title:'Meine geplante Regeneration',sport:'other'}]
 assert.equal(buildSevenDayCoach(d).days[0].kind,'existing')
})
test('postrace check-in only writes authenticated owner data, no medical diagnosis or automatic scheduling',()=>{
 const api=read('supabase/functions/garmin-coach-context/index.ts')
 const sql=read('supabase/migrations/20261117103000_coach_day_decisions_postrace_v0976.sql')
 const component=read('src/components/CoachPostRaceBarometer.tsx')
 assert.match(api,/input\.action==='record_race_recovery'/)
 assert.match(api,/Number\.isInteger\(fatigue\)/)
 assert.match(api,/Number\.isInteger\(soreness\)/)
 assert.doesNotMatch(api,/create_coach_workout|intervals.*publish/i)
 assert.match(sql,/enable row level security|RLS and revoked direct access are intentionally unchanged/)
 assert.match(component,/setFatigue\(latest\?\.fatigue\?\?null\)/)
 assert.match(component,/disabled=\{busy\|\|fatigue===null\|\|soreness===null\}/)
 assert.match(component,/record_race_recovery/)
 assert.match(component,/Wie sehr bist du im Arsch\?/)
 assert.match(component,/Keine pauschale Kalendersperre/)
})
test('athlete can create own date-specific activity draft and has a real reject action',()=>{
 const ui=read('src/components/CoachDecisionLive.tsx')
 const coach=read('src/components/CoachSevenDay.tsx')
 assert.match(ui,/onDecline\(day.date\)/)
 assert.match(ui,/onCustom\(day.date\)/)
 assert.match(ui,/onAcceptRest\(day.date\)/)
 assert.match(coach,/Eigener Vorschlag/)
 assert.match(coach,/sessionType:'event',notes/)
 assert.match(coach,/garmin-training-plan/)
 assert.match(coach,/Es wurde noch nichts an Garmin oder Intervals.icu gesendet/)
})
test('weight popup uses fixed viewport center independent of bottom-sheet flex CSS',()=>{
 const css=read('src/styles/coach-glance.css')
 assert.match(css,/body > \.co-dialog-backdrop > \.co-dialog\{position:absolute;top:50%;left:50%/)
 assert.match(css,/transform:translate\(-50%,-50%\)/)
 assert.match(css,/height:100dvh/)
 assert.match(css,/max-height:calc\(100dvh - 24px/)
})

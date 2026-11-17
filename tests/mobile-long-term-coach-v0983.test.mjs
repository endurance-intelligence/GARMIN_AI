import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildLongTermCoachPlan} from '../src/lib/coachLongTermPlan.mjs'
import {coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-17'
const source=(date='2027-02-05',distance=112,overrides={})=>({
 today,
 goal:{goal:{race_date:date,race_name:'Heartbeat Ultra Fulda',distance_km:distance}},
 health:{training:{runKm7:40,previousRunKm7:38,historyStatus:'complete',truncated:false}},
 life:{context:{illness_state:'well',blocked_periods:[],post_workout_feedback:[]}},
 ...overrides
})
const feedback=(day,score=9,leg='heavy')=>({
 activityId:'session-'+day,activityDate:coachAddDays(today,-day),
 activityName:'Lauf',reportedOn:today,rpe:score,legs:leg,
 symptoms:'none',feel:'harder',note:''
})
test('current race week and two weeks of recovery get NO artificial mileage targets',()=>{
 const plan=buildLongTermCoachPlan(source('2026-11-21'))
 assert.equal(plan.weeks[0].phase,'race')
 assert.equal(plan.weeks[0].isRaceWeek,true)
 assert.equal(plan.weeks[0].targetKm,null)
 assert.equal(plan.weeks[0].longRunMinutes,null)
 assert.equal(plan.weeks.length,3)
 assert.deepEqual(plan.weeks.map(x=>x.phase),['race','recovery','recovery'])
 assert.ok(plan.notes.some(x=>x.includes('Rennwoche')))
 assert.ok(plan.notes.some(x=>x.includes('Erholung')))
})
test('a future goal produces a 12-week progressive base/build/specific/peak/taper/race roadmap',()=>{
 const plan=buildLongTermCoachPlan(source())
 assert.equal(plan.weeks.length,12)
 assert.equal(plan.raceDate,'2027-02-05')
 assert.equal(plan.baselineKm,39)
 assert.equal(plan.weeks[0].start,'2026-11-16')
 assert.equal(plan.weeks[0].phase,'build')
 assert.ok(plan.weeks.some(x=>x.phase==='specific'))
 assert.ok(plan.weeks.some(x=>x.phase==='peak'))
 assert.ok(plan.weeks.some(x=>x.phase==='taper'))
 assert.equal(plan.weeks.at(-1).phase,'race')
 assert.ok(plan.weeks.filter(w=>w.targetKm!==null).every(w=>
  w.targetKm.low<=w.targetKm.high&&w.targetKm.high<=50))
 assert.ok(plan.weeks.some(w=>w.focus.includes('Verpflegung')))
})
test('every fourth week deliberately reduces volume; no fictitious readiness percentages',()=>{
 const plan=buildLongTermCoachPlan(source())
 assert.ok(plan.weeks[3].targetKm.high<plan.weeks[2].targetKm.high)
 assert.match(plan.weeks[3].key,/Entlastungswoche/)
 assert.ok(!plan.weeks.some(w=>/fit zu \d+%|ready\s*\d+%/i.test(w.focus+w.key)))
})
test('sick and unavailable periods protect training without calendar writes',()=>{
 const sick=source()
 sick.life.context.illness_state='sick'
 const p=buildLongTermCoachPlan(sick)
 assert.ok(p.weeks.every(w=>w.phase==='paused'&&w.targetKm===null))
 const blocked=source()
 blocked.life.context.blocked_periods=[{start:'2026-11-30',end:'2026-12-04'}]
 const b=buildLongTermCoachPlan(blocked)
 assert.equal(b.weeks[2].phase,'paused')
 assert.equal(b.weeks[2].targetKm,null)
 assert.notEqual(b.weeks[1].phase,'paused')
})
test('incomplete Garmin history shows phases but no invented run targets',()=>{
 const snap=source()
 snap.health.training.historyStatus='partial'
 const plan=buildLongTermCoachPlan(snap)
 assert.equal(plan.baselineKm,null)
 assert.ok(plan.weeks.every(w=>w.targetKm===null&&w.longRunMinutes===null))
 assert.match(plan.notes.join(' '),/vollständige Garmin-Trainingshistorie/)
})
test('high 14-day athlete feedback pauses immediate build, but does not create calendar blockers',()=>{
 const snap=source()
 snap.life.context.post_workout_feedback=[
  feedback(3),feedback(4,8),feedback(5,8),feedback(7,6)]
 const p=buildLongTermCoachPlan(snap)
 assert.equal(p.weeks[0].phase,'paused')
 assert.equal(p.weeks[0].targetKm,null)
 assert.equal(p.weeks[1].phase,'paused')
 assert.notEqual(p.weeks[2].phase,'paused')
 assert.ok(p.notes.some(x=>x.includes('Feedback')))
})
test('no goal or long-expired goal requests a new target instead of fake future weeks',()=>{
 const a=source()
 a.goal.goal=null
 assert.equal(buildLongTermCoachPlan(a).weeks.length,0)
 const b=buildLongTermCoachPlan(source('2026-10-01'))
 assert.equal(b.hasGoal,false)
 assert.equal(b.weeks.length,0)
})
test('week overview remains a preview: no direct persistence, no automatic Garmin or Intervals send',()=>{
 const module=read('src/lib/coachLongTermPlan.mjs')
 const ui=read('src/components/CoachLongTermPlan.tsx')
 assert.match(module,/no exact prescriptions|not exact prescriptions/i)
 assert.doesNotMatch(module,/fetch\(|supabase|updateCalendar|\.insert\(|\.upsert\(/)
 assert.match(ui,/<details className="cltp-root"/)
 assert.match(ui,/Nur Planungsrahmen/)
 assert.match(ui,/Keine automatischen Kalenderänderungen/)
 assert.match(ui,/DEIN ZIEL · MEHRWÖCHIGE PLANUNG/)
 assert.match(ui,/Laufumfang grob/)
 assert.match(read('src/pages/GoalsPage.tsx'),/<CoachLongTermPlan today=\{berlinDateToday\(\)\} snapshot=\{snapshot\}/)
})
test('race countdown is a vertically and horizontally centered group, without shifting mobile layout',()=>{
 const css=read('src/styles/coach-goal.css')
 assert.match(css,/v0\.9\.83: center numeral/)
 assert.match(css,/\.cg-root\.cg-home-hero \.cg-home-days\{\s*display:flex;flex-direction:column;align-items:center;justify-content:center/)
 assert.match(css,/gap:3px;text-align:center;grid-template-rows:none/)
 assert.match(css,/@media\(max-width:610px\)\{\s*\.cg-root\.cg-home-hero \.cg-home-days\{margin-right:0;gap:2px\}/)
 const tsx=read('src/components/CoachGoalPanel.tsx')
 assert.doesNotMatch(tsx.slice(tsx.indexOf('if(compact)return'),tsx.indexOf('return <section className=',tsx.indexOf('if(compact)return')+20)),/AKTIVES ZIEL/)
})

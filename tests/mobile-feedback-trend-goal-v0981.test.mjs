import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeWorkoutFeedbackTrend} from '../src/lib/feedbackTrend.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-17'
const feedback=(daysAgo,rpe=5,extra={})=>({
 activityId:'session-'+daysAgo,activityDate:coachAddDays(today,-daysAgo),
 reportedOn:today,rpe,legs:'ok',symptoms:'none',feel:'as_expected',
 activityName:'Lauf '+daysAgo,note:'',...extra
})
const snapshot=(reports=[],raceDate='2027-06-15')=>({
 today,health:{metrics:Array.from({length:18},(_,i)=>({
  metric_date:coachAddDays(today,i-17),hrv_ms:48,resting_heart_rate:43,sleep_seconds:26900
 })),training:{runKm7:32,previousRunKm7:31,historyStatus:'complete',truncated:false}},
 boards:[{activities:[],manual:[]}],options:{options:[],choices:[]},plans:{entries:[]},
 goal:{goal:{race_date:raceDate,race_name:'Hermannslauf',distance_km:31.1}},
 life:{context:{illness_state:'well',return_started_on:null,blocked_periods:[],run_reviews:[],
  day_decisions:[],race_recovery_checks:[],post_workout_feedback:reports},runs:[]}
})
test('14/28-day feedback trend counts only verified-shaped, dated inputs once per activity',()=>{
 const source=[feedback(0,8),feedback(1,9),feedback(3,5),feedback(19,7),
  feedback(1,7,{reportedOn:'2026-11-15'}),feedback(29,9),
  feedback(2,12),feedback(2,4,{activityId:''})]
 const trend=analyzeWorkoutFeedbackTrend(source,today)
 assert.equal(trend.count14,3)
 assert.equal(trend.count28,4)
 assert.equal(trend.highRpe14,2)
 assert.equal(trend.averageRpe14,7.3)
 assert.ok(!trend.evidence.some(x=>/fitness|readiness/i.test(x)))
})
test('no synthetic confidence: without at least three responses the Coach remains unchanged',()=>{
 const t=analyzeWorkoutFeedbackTrend([feedback(3,9),feedback(4,9)],today)
 assert.equal(t.level,'insufficient')
 assert.equal(t.kind,'none')
 assert.equal(t.count14,2)
 const base=buildSevenDayCoach(snapshot())
 const partial=buildSevenDayCoach(snapshot([feedback(3,9),feedback(4,9)]))
 assert.deepEqual(partial.days,base.days)
})
test('three hard recent sessions trigger conservative suggestions for the next week',()=>{
 const reports=[feedback(1,9,{legs:'heavy'}),feedback(2,8,{legs:'heavy'}),
  feedback(4,8),feedback(6,5),feedback(8,5)]
 const trend=analyzeWorkoutFeedbackTrend(reports,today)
 assert.equal(trend.level,'high')
 assert.equal(trend.kind,'reduce')
 assert.equal(trend.highRpe14,3)
 assert.equal(trend.heavyLegs14,2)
 const adapted=buildSevenDayCoach(snapshot(reports))
 const original=buildSevenDayCoach(snapshot())
 assert.equal(adapted.feedbackTrend.kind,'reduce')
 assert.equal(adapted.days[0].kind,'recovery')
 assert.equal(adapted.days[0].approvable,false)
 assert.match(adapted.days[0].reason,/Rückmeldungen/)
 assert.equal(original.days[0].kind,'easy')
 assert.ok(adapted.flags.some(x=>x.includes('Persönlicher Belastungsverlauf')))
})
test('repeated lighter warning signs shorten easy and long sessions, not intensify them',()=>{
 const reports=[feedback(1,6,{symptoms:'light'}),feedback(3,6,{symptoms:'light'}),
  feedback(5,5),feedback(9,5)]
 const trend=analyzeWorkoutFeedbackTrend(reports,today)
 assert.equal(trend.level,'caution')
 assert.equal(trend.kind,'shorten')
 assert.equal(trend.lightSymptoms14,2)
 const plan=buildSevenDayCoach(snapshot(reports))
 const baseline=buildSevenDayCoach(snapshot())
 const first=plan.days.find(x=>x.kind==='easy'&&x.date===today)
 assert.ok(first)
 assert.equal(first.minutes,25)
 assert.ok(first.minutes<baseline.days[0].minutes)
 const sunday=plan.days.find(x=>x.date===coachAddDays(today,5))
 assert.equal(sunday.kind,'easy')
 assert.equal(sunday.minutes,45)
 assert.equal(sunday.approvable,true)
})
test('stable feedback preserves planned progression, never triggers automatic harder training',()=>{
 const reports=[feedback(1,5),feedback(3,6),feedback(5,4),feedback(7,5),feedback(9,5)]
 const t=analyzeWorkoutFeedbackTrend(reports,today)
 assert.equal(t.level,'stable')
 assert.equal(t.kind,'maintain')
 assert.deepEqual(buildSevenDayCoach(snapshot(reports)).days,
  buildSevenDayCoach(snapshot()).days)
})
test('stale feedback does not keep limiting training after seven days without new evidence',()=>{
 const reports=[feedback(8,9,{legs:'heavy'}),feedback(9,9,{legs:'heavy'}),
  feedback(10,8),feedback(12,9)]
 const t=analyzeWorkoutFeedbackTrend(reports,today)
 assert.notEqual(t.kind,'reduce')
 assert.deepEqual(buildSevenDayCoach(snapshot(reports)).days,
  buildSevenDayCoach(snapshot()).days)
})
test('race days, illness, existing calendar plans and user decisions are never overwritten',()=>{
 const reports=[feedback(1,9,{legs:'heavy'}),feedback(2,8,{legs:'heavy'}),
  feedback(4,8)]
 const race=buildSevenDayCoach(snapshot(reports,today))
 assert.equal(race.days[0].kind,'race')
 const existing=snapshot(reports)
 existing.plans.entries=[{training_date:today,state:'draft',title:'Schon freigegeben',sport:'running'}]
 assert.equal(buildSevenDayCoach(existing).days[0].kind,'existing')
 const blocked=snapshot(reports)
 blocked.life.context.illness_state='sick'
 assert.equal(buildSevenDayCoach(blocked).days[0].kind,'illness')
 const accepted=snapshot(reports)
 accepted.life.context.day_decisions=[{date:today,choice:'accepted'}]
 const p=buildSevenDayCoach(accepted)
 assert.equal(p.days[0].kind,'easy')
 assert.equal(p.days[0].decision,'accepted')
 assert.equal(p.days[0].approvable,false)
})
test('race image has a light tile and relaxed, mobile-safe layout',()=>{
 const css=read('src/styles/coach-goal.css')
 assert.match(css,/background:linear-gradient\(160deg,#ffffff,#f0f3f9\)/)
 assert.match(css,/\.cg-home-hero \.cg-goal-emblem/)
 assert.match(css,/object-fit:contain/)
 assert.match(css,/grid-template-columns:minmax\(0,1\.17fr\) minmax\(300px,\.83fr\)/)
 assert.match(css,/@media\(max-width:610px\)/)
 assert.match(css,/@media\(max-width:385px\)/)
})
test('trend is real, compact, explainable and only changes Coach proposals',()=>{
 const card=read('src/components/FeedbackTrendCard.tsx')
 const coach=read('src/components/CoachSevenDay.tsx')
 const logic=read('src/lib/coachSevenDay.mjs')
 const css=read('src/styles/feedback-trend.css')
 assert.match(card,/analyzeWorkoutFeedbackTrend\(feedback,today\)/)
 assert.match(card,/<details className=\{'cft-root is-'\+trend\.level\}/)
 assert.match(card,/Rückmeldungen/)
 assert.match(card,/14 \/ 28 Tage/)
 assert.match(coach,/<FeedbackTrendCard/)
 assert.match(coach,/feedback=\{snapshot\.life\.context\.post_workout_feedback\}/)
 assert.match(logic,/trendReducing/)
 assert.match(logic,/trendShortening/)
 assert.match(logic,/Kein vorhandener Kalendereintrag wird geändert/)
 assert.doesNotMatch(logic,/publish\(|sendToIntervals\(|autoApprove/)
 assert.match(css,/\.cft-head\{list-style:none/)
})

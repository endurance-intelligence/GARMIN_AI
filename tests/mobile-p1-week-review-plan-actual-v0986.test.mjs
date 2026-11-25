import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {summarizeLastCompletedWeek} from '../src/lib/completedWeekReview.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-17'
const start='2026-11-09'
const plan=(date,time='19:00',steps=1200,id='aa228a3a-b7be-43fd-96ef-5e95ad9f8fa1')=>({
 id,training_date:date,title:'Coach · locker laufen',sport:'running',state:'pending',
 archive_snapshot:{sourceKind:'coach',coachKind:'easy',startTime:time,
  warmup:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:steps}]},
  cooldown:{durationSeconds:300}}
})
const run=(date,time,id,duration=3300,distance=7800)=>({
 activity_id:id,start_time_local:date+' '+time,activity_name:'Lage · locker',
 sport_type:'running',duration_s:duration,distance_m:distance,average_heart_rate:132
})
const p1=plan('2026-11-10','19:00',1200)
const p2=plan('2026-11-12','19:00',1800,'be457030-e07a-497e-88a2-be5911c11aca')
const a1=run('2026-11-10','19:12:00','garmin-run-10',3300,8000)
const a2=run('2026-11-12','19:08:00','garmin-run-12',4200,10000)
const board=(activities=[a1,a2],manual=[])=>
 ({start,endExclusive:'2026-11-16',activities,manual})
const input=(boards=[board()],entries=[p1,p2])=>({
 today,boards,plans:{entries}
})
const snapshot=(boards=[board()],entries=[p1,p2],date='2027-02-05')=>({
 today,health:{metrics:Array.from({length:18},(_,i)=>({
  metric_date:coachAddDays(today,i-17),
  hrv_ms:49,resting_heart_rate:43,sleep_seconds:27600
 })),training:{runKm7:32,previousRunKm7:30,historyStatus:'complete',truncated:false}},
 boards,options:{options:[],choices:[]},plans:{entries},
 goal:{goal:{race_date:date,race_name:'Hermannslauf',distance_km:31.1}},
 life:{context:{illness_state:'well',blocked_periods:[],day_decisions:[],
  run_reviews:[],race_recovery_checks:[],post_workout_feedback:[]},runs:[]}
})
test('last finished ISO Monday-Sunday week is used; no partial current-week score',()=>{
 const r=summarizeLastCompletedWeek(input())
 assert.equal(r.status,'ready')
 assert.equal(r.start,'2026-11-09')
 assert.equal(r.end,'2026-11-15')
 assert.equal(r.runCount,2)
 assert.equal(r.distanceKm,18)
 assert.equal(r.trainingMinutes,125)
 assert.equal(r.approvedPlans,2)
 assert.equal(r.matchedCount,2)
 assert.equal(r.overlongCount,2)
 assert.equal(r.adjustment,'shorten')
 assert.equal(r.deltaMinutes,55)
 assert.equal(r.examples[0].plannedMinutes,30)
 assert.equal(r.examples[0].actualMinutes,55)
 assert.match(r.summary,/zeitlich plausibel zugeordnet/)
})
test('no previous Garmin week: no fabricated 0 km, no missing training, no coach change',()=>{
 const r=summarizeLastCompletedWeek(input([{start:'2026-11-16',activities:[],manual:[]}]))
 assert.equal(r.status,'unavailable')
 assert.equal(r.distanceKm,null)
 assert.equal(r.matchedCount,null)
 assert.equal(r.adjustment,'none')
 const base=buildSevenDayCoach(snapshot([]))
 const without=buildSevenDayCoach(snapshot([{start:'2026-11-16',activities:[],manual:[]}]))
 assert.deepEqual(without.days,base.days)
})
test('draft-only and late-start runs never count as approved completed workouts',()=>{
 const draft={...p1,state:'draft'}
 const r=summarizeLastCompletedWeek(input([board([a1,a2])],[draft,p2]))
 assert.equal(r.approvedPlans,1)
 assert.equal(r.matchedCount,1)
 assert.equal(r.unlinkedPlans,0)
 assert.equal(r.extraRuns,1)
 assert.equal(r.adjustment,'none')
 const late=run('2026-11-12','23:30:00','garmin-late-12',4200)
 const l=summarizeLastCompletedWeek(input([board([a1,late])]))
 assert.equal(l.matchedCount,1)
 assert.equal(l.unlinkedPlans,1)
 assert.match(l.next,/nicht automatisch ausgefallen/)
})
test('multiple runs on the same day are ambiguous, not confirmed completion',()=>{
 const another=run('2026-11-10','22:00:00','garmin-double',900)
 const r=summarizeLastCompletedWeek(input([board([a1,another,a2])]))
 assert.equal(r.runCount,3)
 assert.equal(r.matchedCount,1)
 assert.equal(r.unlinkedPlans,1)
 assert.equal(r.adjustment,'none')
})
test('Garmin cross-training and manually entered mobility count as time, not run km',()=>{
 const soccer={...a1,activity_id:'soccer',sport_type:'soccer',distance_m:10000,duration_s:3600}
 const manual={id:'man-1',session_date:'2026-11-13',kind:'strength',duration_minutes:30}
 const r=summarizeLastCompletedWeek(input([board([a1,a2,soccer],[manual])]))
 assert.equal(r.runCount,2)
 assert.equal(r.distanceKm,18)
 assert.equal(r.trainingMinutes,215)
 assert.equal(r.manualCount,1)
 assert.equal(r.matchedCount,2)
})
test('missing running distance must be clearly shown as incomplete rather than 0 km',()=>{
 const incomplete={...a1,distance_m:null}
 const r=summarizeLastCompletedWeek(input([board([incomplete,a2])]))
 assert.equal(r.distanceKm,null)
 assert.match(r.summary,/Distanz unvollständig/)
})
test('more than two long approved Coach sessions adjust ONLY one still-open 7-day suggestion',()=>{
 const r=buildSevenDayCoach(snapshot())
 assert.equal(r.completedWeek.adjustment,'shorten')
 const changed=r.days.filter(d=>d.title.startsWith('Wochenrückblick'))
 assert.equal(changed.length,1)
 const day=changed[0]
 assert.equal(day.kind,'easy')
 assert.equal(day.minutes,30)
 assert.equal(day.approvable,true)
 assert.match(day.reason,/Plan-Ist-Abgleich/)
 assert.match(day.reason,/nur.*Vorschlag|Nur Vorschlag/i)
 assert.equal(r.days.length,7)
 assert.ok(r.flags.some(x=>x.includes('Letzte abgeschlossene Trainingswoche')))
})
test('normal recorded sessions and extra unplanned running do not trigger punitive volume increase or cut',()=>{
 const ordinary1={...a1,duration_s:1800}
 const ordinary2={...a2,duration_s:2400}
 const r=buildSevenDayCoach(snapshot([board([ordinary1,ordinary2])]))
 assert.equal(r.completedWeek.overlongCount,0)
 assert.equal(r.completedWeek.adjustment,'none')
 assert.equal(r.days.filter(x=>x.title.startsWith('Wochenrückblick')).length,0)
 const unplanned=buildSevenDayCoach(snapshot([board([ordinary1,ordinary2,run('2026-11-13','15:00:00','free-run',2100)])]))
 assert.equal(unplanned.completedWeek.extraRuns,1)
 assert.equal(unplanned.completedWeek.adjustment,'none')
})
test('race taper and illness override prior-week load; confirmed calendar plan stays intact',()=>{
 const taper=buildSevenDayCoach(snapshot([board()], [p1,p2], '2026-11-21'))
 assert.equal(taper.completedWeek.adjustment,'shorten')
 assert.equal(taper.days.filter(x=>x.title.startsWith('Wochenrückblick')).length,0)
 assert.equal(taper.days[4].kind,'race')
 const ill=snapshot()
 ill.life.context.illness_state='sick'
 assert.equal(buildSevenDayCoach(ill).days[0].kind,'illness')
 const existing=snapshot()
 existing.plans.entries.push({id:'confirmed-tue',training_date:today,title:'Geplantes Workout',
  state:'pending',sport:'running'})
 const planned=buildSevenDayCoach(existing)
 assert.equal(planned.days[0].kind,'existing')
 assert.equal(planned.days[0].title,'Geplantes Workout')
 const accepted=snapshot()
 accepted.life.context.day_decisions=[{date:today,choice:'accepted'}]
 const choice=buildSevenDayCoach(accepted)
 assert.equal(choice.days[0].decision,'accepted')
 assert.notEqual(choice.days[0].title,'Wochenrückblick · 30 Min. locker')
})
test('summary stays compact and athlete can inspect Plan-Ist and choose calendar manually',()=>{
 const coach=read('src/components/CoachSevenDay.tsx')
 const card=read('src/components/WeeklyPlanActualCard.tsx')
 const code=read('src/lib/completedWeekReview.mjs')
 const styles=read('src/styles/weekly-plan-actual.css')
 assert.match(coach,/<WeeklyPlanActualCard review=\{plan\.completedWeek\}/)
 assert.match(card,/<details className=\{'wpa-root'/)
 assert.match(card,/Nicht zugeordnete Einheiten gelten nicht automatisch/)
 assert.match(card,/Kalender und Einheiten prüfen/)
 assert.match(card,/review\.matchedCount/)
 assert.match(code,/assessPlanActual\(a,normalizedRuns,approved\)/)
 assert.doesNotMatch(code,/fetch\(|\\.from\(|\\.upsert\(|\\.insert\(/)
 assert.match(styles,/\.wpa-stats/)
 assert.match(read('src/components/TrainingDevelopment.tsx'),/<WeeklyPlanActualCard/)
})

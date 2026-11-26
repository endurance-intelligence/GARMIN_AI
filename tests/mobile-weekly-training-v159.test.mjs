import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {trainingWeekBaseline,buildWeeklyBudget,replacementImpact,protectRhythmReplacements} from '../src/lib/weeklyTraining.mjs'
import {buildLongTermCoachPlan} from '../src/lib/coachLongTermPlan.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const today='2026-11-26',start='2026-11-23'
const run=(id,date,km,s=km*360)=>({activity_id:id,start_time_local:date+'T09:00',sport_type:'running',distance_m:km*1000,duration_s:s,rpe_raw:30})
const board=(start,activities=[])=>({start,activities,manual:[]})
const easy=(date,minutes=48)=>({date,kind:'easy',title:'Locker',minutes,sport:'running',approvable:true,intensityIntent:'low',reason:'Locker'})
const history={weeks:[40,42,39,41].map((distanceKm,i)=>({start:coachAddDays(start,-7*(i+1)),end:coachAddDays(start,-7*(i+1)+6),available:true,distanceKm}))}
const boards=[board(start,[run('a','2026-11-23',10),run('b','2026-11-25',10),{...run('row','2026-11-25',30),sport_type:'rowing'}]),board('2026-11-16',[run('c','2026-11-17',6)])]
const roadmap=[{start,end:'2026-11-29',phase:'build',phaseLabel:'Aufbau',targetKm:{low:30,high:40},longRunMinutes:75,qualityOptions:1,focus:'Grundlage'}]
const budget=(days,extra={})=>buildWeeklyBudget({today,start,boards,roadmap,days,...extra})
test('completed non-race weeks set a conservative common baseline, never race mileage',()=>{
 assert.equal(trainingWeekBaseline(history),40.5)
 const raced=structuredClone(history);raced.weeks[0].distanceKm=112
 assert.equal(trainingWeekBaseline(raced,['2026-11-21']),41)
 assert.equal(trainingWeekBaseline(raced,['2026-11-21','2026-11-14']),null)
 const p=buildLongTermCoachPlan({today,goal:{goal:{race_date:'2027-05-01',race_name:'Ultra',distance_km:60}},health:{training:{runKm7:112,previousRunKm7:40,historyStatus:'complete',truncated:false}},life:{context:{illness_state:'well'}},history})
 assert.equal(p.baselineKm,40.5)
})
test('20 actual running km, rowing excluded, forecast includes only identifiable open runs',()=>{
 const b=budget([easy(today),easy('2026-11-27')])
 assert.equal(b.actualKm,20)
 assert.equal(b.suggestedKm,16)
 assert.equal(b.forecastKm,36)
 assert.equal(b.rowingDays,1)
 assert.equal(b.gapKm,0)
 assert.equal(b.unknown,2)
 const impact=replacementImpact(b,today)
 assert.equal(impact.afterKm,28)
 assert.equal(impact.allowed,false)
})
test('only adequate projected running surplus permits substitution, never double replacement',()=>{
 const days=[easy(today),easy('2026-11-27'),easy('2026-11-29')]
 const b=budget(days)
 assert.equal(b.forecastKm,44)
 assert.equal(replacementImpact(b,today).allowed,true)
 const row=d=>({...d,kind:'rowing',sport:'other',rhythm:[{kind:'rowing',title:'Rudern',minutes:30,status:'suggested',reason:'Wunsch'}]})
 const next=protectRhythmReplacements(days,[row(days[0]),row(days[1]),days[2]],d=>budget(d))
 assert.equal(next[0].kind,'rowing')
 assert.equal(next[1].kind,'easy')
 assert.equal(next[1].rhythm[0].status,'paused')
 assert.equal(budget(next).forecastKm,36)
})
test('protected phase, missing distances, missing pace and other ISO week cannot allow substitutions',()=>{
 const days=[easy(today),easy('2026-11-27'),easy('2026-11-29')]
 const paused=budget(days,{protectedPhase:true})
 assert.equal(paused.target,null)
 assert.equal(replacementImpact(paused,today).allowed,false)
 const missing=budget(days,{boards:boards.slice(1)})
 assert.equal(missing.actualKm,null)
 assert.equal(missing.forecastKm,null)
 assert.equal(replacementImpact(missing,today).allowed,false)
 const unknown=budget(days,{boards:[board(start,[{...run('a','2026-11-25',10),distance_m:null}])]})
 assert.equal(unknown.actualKm,null)
 const noPace=budget(days,{boards:[boards[0]]})
 assert.equal(noPace.paceSeconds,null)
 assert.equal(replacementImpact(noPace,today).allowed,false)
 assert.equal(replacementImpact({...budget(days),current:false},today).allowed,false)
})
test('saved drafts and confirmed timed workouts counted separately, same-day completed never counted twice',()=>{
 const snap={sourceKind:'coach',coachKind:'easy',warmup:{durationSeconds:300},cooldown:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:1800}]}}
 const plans=[{training_date:today,state:'draft',sport:'running',archive_snapshot:snap},{training_date:'2026-11-27',state:'confirmed',sport:'running',archive_snapshot:snap},{training_date:'2026-11-25',state:'confirmed',sport:'running',archive_snapshot:snap},{training_date:'2026-11-29',state:'confirmed',sport:'running',archive_snapshot:null}]
 const b=budget([easy(today),easy('2026-11-27')],{plans})
 assert.equal(b.actualKm,20)
 assert.equal(b.draftKm,6.6);assert.equal(b.approvedKm,6.6);assert.equal(b.suggestedKm,0)
 assert.ok(b.unknown>=1)
})
test('post-ultra integration: current and future goals do not force a weekly quota',()=>{
 const input={today,health:{metrics:Array.from({length:18},(_,i)=>({metric_date:coachAddDays(today,i-17),hrv_ms:50,resting_heart_rate:42,sleep_seconds:27000})),training:{runKm7:60,previousRunKm7:40,historyStatus:'complete',truncated:false}},
 boards:[...boards,board('2026-11-16',[run('race','2026-11-21',50.7,28800)])],
 goal:{goal:{race_date:'2027-04-25',race_name:'Next ultra',distance_km:60}},racePortfolio:{others:[{race_date:'2026-11-21',race_name:'Heartbeat',distance_km:112}]},
 life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[],day_decisions:[]},runs:[],trainingRhythm:{rowing:{days:[4],minutes:30},strength:{days:[5],minutes:30}}},plans:{entries:[]}}
 const p=buildSevenDayCoach(input),b=p.weeklyBudgets.find(w=>w.current)
 assert.equal(b.target,null);assert.equal(p.alternatives.length,0)
 assert.equal(p.days[0].rhythm[0].status,'paused')
})
test('shared data powers calendar, Coach and goal roadmap; no automatic writes',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const source=read('src/lib/coachSevenDay.mjs')
 assert.match(source,/protectRhythmReplacements\(polarized.days,rhythmProposed,budgetFor\)/)
 assert.match(source,/const impact=replacementImpact\(budgetFor/)
 assert.match(read('src/pages/CalendarPage.tsx'),/<WeeklyTrainingCard budget=\{visibleBudget\}/)
 assert.match(read('src/components/CoachSevenDay.tsx'),/<WeeklyTrainingCard budget=\{plan.weeklyBudgets/)
 assert.match(read('src/components/CoachLongTermPlan.tsx'),/history:analyzeCoachFourWeeks/)
 assert.doesNotMatch(read('src/lib/weeklyTraining.mjs'),/fetch\(|\.insert\(|\.upsert\(/)
})

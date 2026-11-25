import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {applyPolarizedGuidance,POLARIZED_METHOD} from '../src/lib/polarizedTraining.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
import {buildLongTermCoachPlan} from '../src/lib/coachLongTermPlan.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-12-01'
const day=(offset,kind,title,minutes=40)=>({
 date:coachAddDays(today,offset),kind,title,minutes,sport:'running',
 reason:'Geplante persönliche Empfehlung.',approvable:['easy','long'].includes(kind)
})
const proposed=[
 day(0,'easy','Locker',40),
 day(1,'option','ORC Track (optional)',null),
 day(2,'easy','Locker',40),
 day(3,'easy','Locker',45),
 day(4,'recovery','Ruhetag',null),
 day(5,'option','ORC Track (optional)',null),
 day(6,'long','Langer Lauf',75)
]
const sample=(raceDate='2027-02-05')=>({
 today,health:{
  metrics:Array.from({length:18},(_,i)=>({
   metric_date:coachAddDays(today,i-17),hrv_ms:50,
   resting_heart_rate:43,sleep_seconds:27500
  })),
  training:{runKm7:34,previousRunKm7:35,historyStatus:'complete',truncated:false}
 },
 boards:[{start:'2026-11-23',activities:[],manual:[]}],
 options:{options:[],choices:[]},plans:{entries:[]},
 goal:{goal:{race_name:'Hermannslauf',race_date:raceDate,distance_km:31.1}},
 life:{context:{illness_state:'well',return_started_on:null,
  blocked_periods:[],run_reviews:[],day_decisions:[],race_recovery_checks:[],
  post_workout_feedback:[]},runs:[]}
})
test('FitCraft/Seiler method is not the 5 Garmin zones or a mandatory 20% HIIT quota',()=>{
 assert.equal(POLARIZED_METHOD.id,'polarized')
 assert.match(POLARIZED_METHOD.citation,/getfitcraft.com\/science\/polarized-training-research/)
 assert.match(POLARIZED_METHOD.easy,/LT1/)
 assert.match(POLARIZED_METHOD.middle,/LT1/)
 assert.match(POLARIZED_METHOD.hard,/LT2/)
 assert.match(POLARIZED_METHOD.weeklyRatio,/keine starre Quote/)
 assert.doesNotMatch(read('src/lib/polarizedTraining.mjs'),/maxHeartRate.*0\.8|80percent|Math\.round\(.*20\s*\/\s*100/)
})
test('a normal week has four low-intensity candidates and one optional hard quality slot',()=>{
 const result=applyPolarizedGuidance(proposed,{today,boards:[],feedback:[]})
 assert.equal(result.status,'optional-hard')
 assert.equal(result.easyCount,4)
 assert.equal(result.qualityDay,proposed[1].date)
 assert.equal(result.days.filter(d=>d.intensityIntent==='hard-option').length,1)
 assert.equal(result.days.filter(d=>d.intensityIntent==='low-option').length,1)
 assert.equal(result.days.filter(d=>d.intensityIntent==='low').length,4)
 assert.match(result.days[1].reason,/oberhalb LT2/)
 assert.match(result.days[5].reason,/keine zweite harte Bahneinheit/)
 assert.ok(result.days[1].kind==='option'&&!result.days[1].approvable,
  'Coach never directly publishes an unreviewed ORC interval workout')
})
test('a 3 easy / 1 hard ratio is not forced without enough easy proposals',()=>{
 const result=applyPolarizedGuidance(proposed.filter((d,i)=>i!==2&&i!==3),
  {today,boards:[],feedback:[]})
 assert.equal(result.qualityDay,null)
 assert.equal(result.status,'easy-first')
 assert.equal(result.days.filter(d=>d.intensityIntent==='hard-option').length,0)
 assert.match(result.days[1].reason,/keine zweite harte|Nur locker|nur locker/i)
})
test('a club track already selected occupies the quality slot; no second interval session is added',()=>{
 const selected=proposed.map(d=>d.date===proposed[5].date?
  {...d,kind:'chosen',title:'ORC Track',approvable:false}:d)
 const result=applyPolarizedGuidance(selected,{today,boards:[],feedback:[]})
 assert.equal(result.status,'already-chosen')
 assert.equal(result.qualityDay,selected[5].date)
 assert.equal(result.days[5],selected[5])
 assert.equal(result.days.filter(d=>d.intensityIntent==='hard-option').length,0)
 assert.match(result.days[1].reason,/keine zweite harte/)
})
test('soccer, heavy post-training feedback, illness or taper prevent additional hard quality',()=>{
 const soccer=applyPolarizedGuidance(proposed,{today,
  boards:[{activities:[{sport_type:'soccer',start_time_local:today+' 19:00:00'}]}]})
 assert.equal(soccer.status,'recover')
 assert.equal(soccer.qualityDay,null)
 const feedback=applyPolarizedGuidance(proposed,{today,
  feedback:[{activityDate:coachAddDays(today,-1),rpe:9,symptoms:'none'}]})
 assert.equal(feedback.qualityDay,null)
 const race=applyPolarizedGuidance(proposed,{today,raceDate:coachAddDays(today,4)})
 assert.equal(race.status,'protected')
 assert.equal(race.qualityDay,null)
 const sick=applyPolarizedGuidance(proposed,{today,ill:true})
 assert.equal(sick.qualityDay,null)
 const limited=applyPolarizedGuidance(proposed,{today,observationLimited:true})
 assert.equal(limited.qualityDay,null)
 assert.equal(limited.days[1].kind,'option','keep original club day visible')
})
test('race, calendar, completed and decided sessions are not rewritten',()=>{
 const protectedDays=[
  {...proposed[0],kind:'existing',title:'Gespeicherte Garmin-Einheit'},
  {...proposed[1],kind:'race',title:'Wettkampftag'},
  {...proposed[2],decision:'accepted'},
  {...proposed[3],kind:'completed',title:'Gelaufen'}
 ]
 const r=applyPolarizedGuidance(protectedDays,{today})
 assert.equal(r.qualityDay,null)
 for(let i=0;i<protectedDays.length;i++)assert.deepEqual(r.days[i],protectedDays[i])
})
test('seven-day Coach uses polarized guidance without changing actual race taper',()=>{
 const plan=buildSevenDayCoach({...sample('2026-11-21'),today:'2026-11-17'})
 assert.equal(plan.trainingMethod.id,'polarized')
 assert.equal(plan.trainingMethod.qualityDay,null)
 assert.equal(plan.trainingMethod.status,'protected')
 assert.equal(plan.days.find(d=>d.date==='2026-11-21').kind,'race')
 assert.equal(plan.days[0].title,'30 Min. locker statt Intervallen')
 assert.ok(plan.flags.some(x=>x.includes('Trainingsmethode: polarisiert')))
 assert.match(plan.days[0].reason,/Sprechtempo/)
})
test('long-range Coach offers maximum one hard quality option only outside taper/deload/recovery',()=>{
 const snap=sample()
 const plan=buildLongTermCoachPlan({
  today,goal:snap.goal,health:snap.health,life:snap.life
 })
 assert.equal(plan.trainingMethod,'polarized')
 assert.ok(plan.weeks.some(w=>w.qualityOptions===1))
 assert.ok(plan.weeks.filter(w=>w.phase==='build'||w.phase==='specific')
  .every(w=>w.qualityOptions<=1))
 assert.ok(plan.weeks.filter(w=>['taper','race','recovery','paused'].includes(w.phase))
  .every(w=>w.qualityOptions===0))
 assert.ok(plan.weeks.filter(w=>w.index%4===0).every(w=>w.qualityOptions===0))
 assert.ok(plan.weeks.every(w=>w.trainingMethod==='polarized'))
 const thisRace=buildLongTermCoachPlan({
  today:'2026-11-17',goal:{goal:{...snap.goal.goal,race_date:'2026-11-21'}},
  health:snap.health,life:snap.life
 })
 assert.equal(thisRace.weeks[0].qualityOptions,0)
 assert.match(thisRace.weeks[0].polarization,/Keine harte Einheit/)
})
test('Method remains source-linked without a duplicate Goals card',()=>{
 const ui=read('src/components/PolarizedMethodCard.tsx')
 const goals=read('src/pages/GoalsPage.tsx')
 const coach=read('src/components/CoachSevenDay.tsx')
 const macro=read('src/components/CoachLongTermPlan.tsx')
 assert.match(ui,/Polarisiertes Training|Viel locker/)
 assert.match(ui,/Sprechtempo/)
 assert.match(ui,/POLARIZED_METHOD\.citation/)
 assert.match(ui,/Fußball/)
 assert.match(ui,/Wir erfinden keine Herzfrequenzgrenzen/)
 assert.doesNotMatch(goals,/<PolarizedMethodCard\/>/)
 assert.match(coach,/className="c7-polarized-method"/)
 assert.match(macro,/week\.qualityOptions>0/)
 assert.match(read('src/lib/coachSevenDay.mjs'),/applyPolarizedGuidance\(toleranceStep\.days,/)
 assert.doesNotMatch(read('src/lib/polarizedTraining.mjs'),/\.upsert\(|\.insert\(|publishWorkout\(|sendToGarmin\(/)
})

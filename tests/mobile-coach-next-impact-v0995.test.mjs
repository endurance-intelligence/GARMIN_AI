import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeRecentCoachImpact,applyRecentCoachImpact} from '../src/lib/coachNextImpact.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-18'
const plan=(date='2026-11-17',time='19:00')=>({
 id:'e3a6adf2-6ef0-4f9c-a04d-cc2e9f923eae',training_date:date,
 title:'Coach · locker',state:'pending',sport:'running',
 archive_snapshot:{sourceKind:'coach',coachKind:'easy',startTime:time,
  warmup:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:1200}]},
  cooldown:{durationSeconds:300}}
})
const run=(date='2026-11-17',time='19:12:00',duration=3600,rpe=80,feeling=75,id='garmin-1')=>({
 activity_id:id,start_time_local:date+' '+time,activity_name:'Lauf · Garmin',
 sport_type:'running',duration_s:duration,distance_m:8500,average_heart_rate:139,
 rpe_raw:rpe,feeling_raw:feeling
})
const recent=(activities=[run()],plans=[plan()],day=today)=>
 analyzeRecentCoachImpact({today:day,boards:[{start:'2026-11-16',activities,manual:[]}],plans})
const suggested=(date,minutes=40,overrides={})=>({
 date,kind:'easy',title:'Lockerer Lauf · 40 Min.',minutes,approvable:true,
 reason:'Grundlagentraining, unter LT1.',sport:'running',...overrides
})
const apply=(impact,days=[suggested('2026-11-19')],extra={})=>
 applyRecentCoachImpact(days,impact,{today,...extra})
test('matched Garmin plan overrun plus real Garmin RPE creates a fully traceable signal',()=>{
 const result=recent()
 assert.equal(result.status,'reduce')
 assert.equal(result.latest.planTitle,'Coach · locker')
 assert.equal(result.latest.plannedMinutes,30)
 assert.equal(result.latest.actualMinutes,60)
 assert.equal(result.latest.deltaMinutes,30)
 assert.equal(result.latest.rpe,8)
 assert.equal(result.latest.feeling,'Gut')
 assert.equal(result.fresh,true)
 assert.match(result.evidence,/Coach-Plan 30 Min., Garmin 60 Min. \(\+30 Min.\), Garmin-RPE 8\/10/)
})
test('RPE high alone and long duration alone do not trigger a second reduction',()=>{
 assert.equal(recent([run('2026-11-17','19:12:00',1820,90)]).status,'observe')
 assert.equal(recent([run('2026-11-17','19:12:00',3600,null)]).status,'observe')
 assert.equal(recent([run('2026-11-17','19:12:00',1820,40)]).status,'stable')
})
test('a weak Garmin feeling plus substantial matched duration delta is also meaningful',()=>{
 const result=recent([run('2026-11-17','19:12:00',3600,40,25)])
 assert.equal(result.status,'reduce')
 assert.equal(result.latest.feeling,'Schwach')
})
test('missing or ambiguous plans cannot become confirmed completed sessions',()=>{
 assert.equal(recent([run()],[]).status,'unlinked')
 assert.equal(recent([run(),run('2026-11-17','21:00:00',2400,90,0,'garmin-2')]).status,'unlinked')
 assert.equal(recent([run()],[{...plan(),state:'draft'}]).status,'unlinked')
 const bad=plan();bad.archive_snapshot.group.steps[0].endMode='lap'
 assert.equal(recent([run()],[bad]).status,'unlinked')
 assert.equal(analyzeRecentCoachImpact({today,boards:null,plans:[]}).status,'unavailable')
})
test('only one still-open easy day is shortened and explanatory evidence is attached',()=>{
 const original=[
  suggested('2026-11-18',40,{kind:'existing',approvable:false,title:'Unverändert'}),
  suggested('2026-11-19',40),
  suggested('2026-11-20',65,{kind:'long'}),
  suggested('2026-11-21',null,{kind:'race',approvable:false})
 ]
 const copy=JSON.stringify(original)
 const x=apply(recent(),original)
 assert.equal(x.impact.effect,'shortened')
 assert.equal(x.impact.appliedDate,'2026-11-19')
 assert.equal(x.impact.previousMinutes,40)
 assert.equal(x.impact.nextMinutes,30)
 assert.equal(x.days[0].title,'Unverändert')
 assert.equal(x.days[1].minutes,30)
 assert.match(x.days[1].reason,/Garmin-RPE 8\/10/)
 assert.equal(x.days[2].minutes,65)
 assert.equal(x.days[3].kind,'race')
 assert.equal(JSON.stringify(original),copy)
})
test('already short coach suggestion is not forcefully reduced below 20 minutes',()=>{
 const x=apply(recent(),[suggested('2026-11-19',20)])
 assert.equal(x.days[0].minutes,20)
 assert.equal(x.impact.effect,'already-conservative')
})
test('race taper, recovery, illness, previous decision and completed sessions outrank adaptation',()=>{
 for(const input of [{raceDate:'2026-11-21'},{raceDate:'2026-11-16'},
  {ill:true},{returning:true},{postIllness:true}]){
  const x=apply(recent(),[suggested('2026-11-19',40)],input)
  assert.equal(x.impact.effect,'protected')
  assert.equal(x.days[0].minutes,40)
 }
 const committed=[
  suggested('2026-11-19',40,{decision:'accepted'}),
  suggested('2026-11-20',40,{kind:'completed',approvable:false}),
  suggested('2026-11-21',40,{kind:'chosen',approvable:false})
 ]
 const y=apply(recent(),committed)
 assert.equal(y.impact.effect,'no-slot')
 assert.deepEqual(y.days,committed)
})
test('stale run never changes a new week; no negative inference from unmatched run',()=>{
 const old=recent([run('2026-11-12')],[plan('2026-11-12')])
 assert.equal(old.status,'reduce')
 assert.equal(old.fresh,false)
 assert.equal(apply(old).impact.effect,'none')
 const none=recent([run('2026-11-17','19:12:00',3600,90)],[])
 assert.equal(apply(none).impact.effect,'none')
})
test('seven-day Coach integrates matched Garmin evidence but protects the pre-race taper',()=>{
 const health={metrics:Array.from({length:17},(_,i)=>({
  metric_date:coachAddDays(today,i-16),hrv_ms:50,
  resting_heart_rate:43,sleep_seconds:27000
 })),training:{runKm7:40,previousRunKm7:38,historyStatus:'complete',truncated:false}}
 const base={today,health,boards:[{start:'2026-11-16',activities:[run()],manual:[]}],
  plans:{entries:[plan()]},options:{options:[],choices:[]},
  life:{context:{illness_state:'well',blocked_periods:[],day_decisions:[],
   run_reviews:[],race_recovery_checks:[],post_workout_feedback:[]},runs:[]},
  goal:{goal:{race_name:'Hermannslauf',race_date:'2027-04-25',distance_km:31.1}}}
 const normal=buildSevenDayCoach(base)
 assert.equal(normal.nextImpact.status,'reduce')
 // A clearly excessive easy run now has a stronger, time-limited recovery
 // recommendation. The older duration reducer must not cut another session.
 assert.equal(normal.purposeFeedback.active,true)
 assert.equal(normal.days[0].kind,'recovery')
 assert.equal(normal.days[1].kind,'recovery')
 assert.equal(normal.nextImpact.effect,'no-slot')
 assert.equal(normal.days.filter(d=>d.title.startsWith('Nach Garmin-Feedback')).length,0)
 assert.equal(normal.trainingMethod.id,'polarized')
 const protectedRace=buildSevenDayCoach({...base,
  goal:{goal:{race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',
   distance_km:112}}})
 assert.equal(protectedRace.nextImpact.effect,'protected')
 assert.equal(protectedRace.days[3].kind,'race')
 assert.equal(protectedRace.days.filter(x=>x.title.startsWith('Nach Garmin-Feedback')).length,0)
})
test('presentation is read-only, transparent and wired to visible Coach recommendations',()=>{
 const coach=read('src/lib/coachSevenDay.mjs')
 const ui=read('src/components/CoachNextImpactCard.tsx')
 const app=read('src/components/CoachSevenDay.tsx')
 const pure=read('src/lib/coachNextImpact.mjs')
 assert.match(coach,/applyRecentCoachImpact\(items,recentImpact/)
 assert.match(coach,/applyArchivedWeekLearning\(toleranceStep.days,archivedLearning/)
 assert.match(coach,/applyPolarizedGuidance\(learned.days/)
 assert.match(coach,/nextImpact:adapted.impact/)
 assert.match(app,/<CoachNextImpactCard impact=\{plan.nextImpact\}/)
 assert.match(ui,/Kein Nachweis|kein Nachweis/)
 assert.match(ui,/Nur eine zeitlich plausible Zuordnung/)
 assert.match(ui,/Keine Kalender- oder Garmin/)
 assert.match(pure,/buildCoachSessionBridge\(\{boards,plans,today,limit:10\}\)/)
 assert.doesNotMatch(pure,/fetch\(|\.insert\(|\.upsert\(|\.update\(/)
})

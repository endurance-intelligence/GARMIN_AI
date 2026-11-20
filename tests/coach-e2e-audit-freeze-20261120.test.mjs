/**
 * Read-only Coach integration audit for the evening before an ultra.
 * All activity/metric fixtures below are SYNTHETIC and contain NO athlete data.
 * The production live-data audit is performed separately via SELECT-only SQL.
 * This test must remain on the QA branch until after race-day release freeze.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
import {analyzeGarminPerception} from '../src/lib/garminPerception.mjs'
import {analyzeAutoRaceRecovery} from '../src/lib/raceRecoveryIntelligence.mjs'
import {analyzeAdaptiveVolume,applyAdaptiveVolume}
 from '../src/lib/coachAdaptiveVolume.mjs'
import {buildCoachSessionBridge} from '../src/lib/coachSessionBridge.mjs'

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const today='2026-11-20'
const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',
 distance_km:112,target_hours:15,race_start_time:'06:00:00'}
const mkRun=(id,date,rpe=null,feeling=null)=>({
 activity_id:'synthetic-'+id,
 activity_name:'Test running session',
 start_time_local:date+' 08:00:00',sport_type:'running',
 duration_s:2700,distance_m:7000,average_heart_rate:137,
 rpe_raw:rpe,feeling_raw:feeling
})
const activities=[
 mkRun('1','2026-11-08',20,75),
 mkRun('2','2026-11-10',60,75),
 mkRun('3','2026-11-12',70,50),
 mkRun('4','2026-11-14',null,null),
 mkRun('5','2026-11-15',null,null),
 mkRun('6','2026-11-17',70,75)
]
const boards=[
 {start:'2026-11-02',activities:activities.filter(a=>a.start_time_local<'2026-11-09'),manual:[]},
 {start:'2026-11-09',activities:activities.filter(a=>a.start_time_local>='2026-11-09'&&a.start_time_local<'2026-11-16'),manual:[]},
 {start:'2026-11-16',activities:activities.filter(a=>a.start_time_local>='2026-11-16'),manual:[]}
]
const metrics=Array.from({length:14},(_,i)=>({
 metric_date:coachAddDays('2026-11-07',i),
 hrv_ms:i===3||i===7?null:51,
 resting_heart_rate:43,
 sleep_seconds:i===3||i===7?null:27500
}))
const life=()=>({context:{
 illness_state:'well',return_started_on:null,blocked_periods:[],
 day_decisions:[],run_reviews:[],post_workout_feedback:[],
 race_recovery_checks:[]
},runs:[]})
const plans=[
 {training_date:'2026-11-10',title:'Cancelled draft',state:'cancelled'},
 {training_date:'2026-11-15',title:'Approved old workout',state:'pending',
  sport:'running'}
]
const snapshot=({at=today,activitiesByWeek=boards,goalValue=goal,healthMetrics=metrics,
 planEntries=plans,lifeValue=life()}={})=>({
 today:at,boards:activitiesByWeek,goal:{goal:goalValue},
 options:{options:[],choices:[]},plans:{entries:planEntries},
 health:{metrics:healthMetrics,training:{
  runKm7:35,previousRunKm7:38,historyStatus:'complete',truncated:false}},
 life:lifeValue
})

test('integrated synthetic workload matches live-data SHAPE, not live athlete data',()=>{
 const x=snapshot()
 const rated=analyzeGarminPerception(x.boards,today)
 assert.equal(activities.length,6)
 assert.equal(rated.count14,4)
 assert.equal(rated.feelingCount14,4)
 assert.equal(rated.averageRpe14,5.5)
 assert.equal(rated.latest.date,'2026-11-17')
 assert.equal(rated.latest.rpe,7)
 assert.equal(rated.qualityCaution,false)
 assert.equal(x.life.context.post_workout_feedback.length,0)
 assert.equal(rated.source.startsWith('Garmin'),true)
 const outcome=buildSevenDayCoach(x)
 assert.equal(outcome.garminPerception.count14,4)
 assert.equal(outcome.garminPerception.feelingCount14,4)
 assert.ok(outcome.flags.some(f=>f.includes('Garmin-Selbsteinschätzung')))
 assert.equal(outcome.trainingMethod.id,'polarized')
 assert.equal(outcome.autoRaceRecovery.status,'upcoming')
 assert.ok(!outcome.flags.some(f=>f.includes('Letzte persönliche Rückmeldung')),
  'no extra user feedback created from already-synced Garmin RPE')
})

test('one day before 112km ultra: taper, race and recovery override approved old training and all adaptive volume',()=>{
 const result=buildSevenDayCoach(snapshot())
 assert.deepEqual(result.days.slice(0,3).map(d=>[d.date,d.kind]),[
  ['2026-11-20','recovery'],
  ['2026-11-21','race'],
  ['2026-11-22','recovery']
 ])
 assert.equal(result.days[0].approvable,false)
 assert.equal(result.days[1].approvable,false)
 assert.equal(result.days[2].approvable,false)
 assert.equal(result.adaptiveVolume.status,'protected')
 assert.equal(result.adaptiveVolume.appliedDate,null)
 assert.notEqual(result.days[0].kind,'existing',
  'old approved workout must not replace race-eve recovery')
 const proposed=[{date:'2026-11-22',kind:'long',sport:'running',
  title:'long',minutes:65,approvable:true,reason:'synthetic'}]
 const volume=analyzeAdaptiveVolume({today,goal,history:{
  weeks:[40,40,40,40].map(distanceKm=>({
   available:true,distanceKm,runs:4,longestRunMinutes:75})),
  totalRated:8,qualityCaution:false
 }})
 assert.equal(volume.status,'protected')
 assert.equal(applyAdaptiveVolume(proposed,volume,{today}).effect,'none')
})

test('missing ultra Garmin recording on 23 November must NOT imply race matched or a training clearance',()=>{
 const x=snapshot({at:'2026-11-23'})
 const post=analyzeAutoRaceRecovery({
  today:x.today,goal,boards:boards,
  health:x.health,life:x.life
 })
 assert.equal(post.status,'awaiting-sync')
 assert.equal(post.actualKm,null)
 assert.equal(post.actualMinutes,null)
 assert.equal(post.healthEvidence,0)
 assert.equal(post.objectiveRecoveryUnknown,true)
 const outcome=buildSevenDayCoach(x)
 assert.equal(outcome.autoRaceRecovery.status,'awaiting-sync')
 assert.equal(outcome.days[0].kind,'recovery')
 assert.equal(outcome.days[0].approvable,false)
 assert.ok(outcome.days.slice(0,3).every(x=>x.kind==='recovery'&&!x.approvable))
 assert.ok(outcome.days.every(x=>!x.title.startsWith('Nach Garmin-Feedback')))
})

test('cancelled/pending plan states never fabricate a Garmin match or auto-approval',()=>{
 const view=buildCoachSessionBridge({boards,plans,today,limit:10})
 assert.equal(view.status,'ready')
 assert.equal(view.totalRuns,6)
 assert.equal(view.matchedCount,0,
  'no activity is linked merely because an old date had a plan')
 const api=read('supabase/functions/garmin-training-plan/index.ts')
 const coach=read('src/components/CoachSevenDay.tsx')
 assert.match(api,/input\.action==='approve'/)
 assert.match(api,/\.eq\('revision',input\.revision\)\.eq\('state','draft'\)/)
 assert.match(api,/state:'pending',approved_at:new Date\(\)\.toISOString\(\)/)
 assert.match(coach,/action:'create_coach_workout'/)
 assert.doesNotMatch(read('src/lib/coachSevenDay.mjs'),/fetch\(|\.insert\(|\.upsert\(/)
})

test('real API contracts: authenticated weekly board delivers exactly the RPE fields used by Coach',()=>{
 const board=read('supabase/functions/garmin-week-board/index.ts')
 const snapshotFile=read('src/lib/coachSnapshot.ts')
 const feedback=read('src/components/GarminFeedbackCard.tsx')
 const coach=read('src/components/CoachSevenDay.tsx')
 assert.match(board,/rpe_raw,feeling_raw/)
 assert.match(board,/email_confirmed_at/)
 assert.match(snapshotFile,/get\('read-garmin-health'\)/)
 assert.match(snapshotFile,/get\('garmin-weekly-options'\)/)
 assert.match(snapshotFile,/get\('garmin-training-plan'\)/)
 assert.match(snapshotFile,/get\('garmin-coach-context'\)/)
 assert.match(snapshotFile,/garmin-week-board\?start=/)
 assert.ok(coach.includes('<GarminFeedbackCard snapshot={snapshot} today={today}/>'))
 assert.doesNotMatch(feedback,/<select|<textarea|record_workout_feedback/)
 assert.ok(coach.includes('<CoachRaceRecoveryCard review={plan.autoRaceRecovery}'))
 assert.ok(coach.includes('<CoachNextImpactCard impact={plan.nextImpact}/>'))
})

test('race freeze: QA stays read-only and does not reference Heartbeat runner modules',()=>{
 const path=read('src/lib/coachSevenDay.mjs')
 assert.doesNotMatch(path,/\b(?:garminSupabase|db)\.from\(|fetch\(|\.upsert\(|\.insert\(/)
 assert.doesNotMatch(read('src/lib/raceRecoveryIntelligence.mjs'),
  /fetch\(|\.upsert\(|\.insert\(/)
 assert.doesNotMatch(read('src/lib/garminPerception.mjs'),
  /fetch\(|\.upsert\(|\.insert\(/)
})

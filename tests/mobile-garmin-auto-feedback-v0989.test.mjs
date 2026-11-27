import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {normalizeGarminRpe,normalizeGarminFeeling,garminFeelingLabel,
 analyzeGarminPerception} from '../src/lib/garminPerception.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-17'
const activity=(id,date,rpe=70,feeling=50)=>({
 activity_id:id,activity_name:'Garmin Einheit '+id,
 start_time_local:date+' 19:05:00',sport_type:'running',
 rpe_raw:rpe,feeling_raw:feeling,distance_m:9000,duration_s:3200
})
const boards=(activities)=>[
 {start:'2026-11-09',activities:activities.filter(x=>x.start_time_local<'2026-11-16'),manual:[]},
 {start:'2026-11-16',activities:activities.filter(x=>x.start_time_local>='2026-11-16'),manual:[]}
]
const fixture=(activities=[])=>({
 today,health:{metrics:Array.from({length:18},(_,i)=>({
  metric_date:coachAddDays(today,i-17),hrv_ms:48,resting_heart_rate:42,sleep_seconds:27500
 })),training:{runKm7:40,previousRunKm7:38,historyStatus:'complete',truncated:false}},
 boards:boards(activities),options:{options:[],choices:[]},plans:{entries:[]},
 goal:{goal:{race_date:'2027-03-01',race_name:'Hermannslauf',distance_km:31.1}},
 life:{context:{illness_state:'well',return_started_on:null,
  blocked_periods:[],run_reviews:[],day_decisions:[],
  race_recovery_checks:[],post_workout_feedback:[]},runs:[]}
})
test('raw Garmin RPE uses TIMES TEN and raw feeling uses five explicit ratings',()=>{
 assert.equal(normalizeGarminRpe(10),1)
 assert.equal(normalizeGarminRpe(80),8)
 assert.equal(normalizeGarminRpe(100),10)
 assert.equal(normalizeGarminRpe(8),null,'raw 8 must never be confused with RPE 8')
 assert.equal(normalizeGarminRpe(-1),null)
 assert.equal(normalizeGarminRpe(null),null)
 assert.equal(normalizeGarminRpe(85),null)
 assert.equal(normalizeGarminFeeling(0),0)
 assert.equal(normalizeGarminFeeling(25),25)
 assert.equal(normalizeGarminFeeling(75),75)
 assert.equal(normalizeGarminFeeling(100),100)
 assert.equal(normalizeGarminFeeling(-1),null)
 assert.equal(garminFeelingLabel(25),'Schwach')
 assert.equal(garminFeelingLabel(75),'Gut')
 assert.equal(garminFeelingLabel(null),null)
})
test('real Garmin assessments are unique, sourced, and recent',()=>{
 const b=boards([
  activity('a','2026-11-16',80,75),
  activity('a','2026-11-16',null,null),
  activity('b','2026-11-12',70,50),
  activity('c','2026-11-11',90,25),
  activity('old','2026-10-17',100,0),
  activity('future','2026-11-18',100,0)
 ])
 const p=analyzeGarminPerception(b,today)
 assert.equal(p.count14,3)
 assert.equal(p.count28,3)
 assert.equal(p.feelingCount14,3)
 assert.equal(p.averageRpe14,8)
 assert.equal(p.hardCount14,2)
 assert.equal(p.veryHardCount14,1)
 assert.equal(p.latest.activityId,'a')
 assert.equal(p.latest.rpe,8)
 assert.equal(p.latest.feelingLabel,'Gut')
 assert.match(p.source,/Garmin/)
})
test('Recent exhausted feeling or RPE 9+ protects quality day without creating an illness',()=>{
 const p=analyzeGarminPerception(boards([activity('a','2026-11-16',90,25)]),today)
 assert.equal(p.level,'high')
 assert.equal(p.qualityCaution,true)
 assert.equal(p.needsRecovery,true)
 assert.match(p.advice,/Erholung/)
 const coach=buildSevenDayCoach(fixture([activity('a','2026-11-16',90,25)]))
 assert.equal(coach.garminPerception.latest.rpe,9)
 assert.equal(coach.garminPerception.latest.feelingLabel,'Schwach')
 assert.equal(coach.attention,true)
 assert.ok(coach.flags.some(x=>x.includes('Garmin-Selbsteinschätzung')))
 assert.match(coach.attentionText,/Garmin-Bewertungen/)
 assert.notEqual(coach.days[0].kind,'illness')
 assert.equal(coach.trainingMethod.status,'protected')
})
test('A single hard workout with good feeling is not automatically a medical or injury warning',()=>{
 const p=analyzeGarminPerception(boards([activity('a','2026-11-16',80,75)]),today)
 assert.equal(p.qualityCaution,false)
 assert.equal(p.needsRecovery,false)
 assert.equal(p.level,'normal')
 const coach=buildSevenDayCoach(fixture([activity('a','2026-11-16',80,75)]))
 assert.equal(coach.garminPerception.count14,1)
 assert.equal(coach.attentionText.includes('Garmin-Bewertungen'),false)
})
test('Repeated intense recent sessions are considered without requiring subjective re-entry',()=>{
 const b=boards([activity('a','2026-11-16',80,75),activity('b','2026-11-15',80,75)])
 const p=analyzeGarminPerception(b,today)
 assert.equal(p.recentHardCount,2)
 assert.equal(p.qualityCaution,true)
 assert.equal(p.needsRecovery,false)
 const coach=buildSevenDayCoach(fixture([...b[0].activities,...b[1].activities]))
 assert.equal(coach.garminPerception.qualityCaution,true)
 assert.equal(coach.trainingMethod.status,'protected')
})
test('Absent Garmin RPE and feeling never creates artificial assessments or a zero-mood rating',()=>{
 const p=analyzeGarminPerception(boards([activity('a','2026-11-16',null,-1)]),today)
 assert.equal(p.count14,0)
 assert.equal(p.latest,null)
 assert.equal(p.qualityCaution,false)
 assert.equal(p.level,'unknown')
 const coach=buildSevenDayCoach(fixture([activity('a','2026-11-16',null,-1)]))
 assert.equal(coach.garminPerception.count14,0)
 assert.ok(!coach.flags.some(x=>x.includes('Garmin-Selbsteinschätzung')))
})
test('Garmin dashboard takes ratings directly from the authenticated week board',()=>{
 const endpoint=read('supabase/functions/garmin-week-board/index.ts')
 const coach=read('src/components/CoachSevenDay.tsx')
 const card=read('src/components/GarminFeedbackCard.tsx')
 const logic=read('src/lib/coachSevenDay.mjs')
 assert.match(endpoint,/rpe_raw,feeling_raw/)
 assert.match(endpoint,/email_confirmed_at/)
 assert.match(endpoint,/Read only/)
 assert.ok(coach.includes('<GarminFeedbackCard snapshot={snapshot} today={today}/>'))
 assert.doesNotMatch(coach,/<PostWorkoutFeedbackCard|<FeedbackTrendCard/)
 assert.match(card,/Anstrengung/)
 assert.match(card,/Gefühl danach/)
 assert.match(card,/Krankheit, Beschwerden/)
 assert.doesNotMatch(card,/<select|<textarea|record_workout_feedback/)
 assert.match(logic,/analyzeGarminPerception\(input\.boards,today\)/)
 assert.match(logic,/qualityLocked:archivedLearning\.caution\|\|garminPerception\.qualityCaution/)
 assert.doesNotMatch(read('src/lib/garminPerception.mjs'),/Math\.random\(|postToIntervals|insert\(|upsert\(/)
})

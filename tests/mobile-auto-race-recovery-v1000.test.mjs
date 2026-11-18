import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessRaceOutcome} from '../src/lib/raceOutcome.mjs'
import {analyzeAutoRaceRecovery} from '../src/lib/raceRecoveryIntelligence.mjs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',
 distance_km:112,target_hours:15}
const race=(extra={})=>({
 activity_id:'heartbeat-112',activity_name:'Heartbeat Ultra',
 start_time_local:'2026-11-21 06:00:00',sport_type:'running',
 duration_s:52500,distance_m:113100,rpe_raw:80,feeling_raw:50,...extra
})
const board=(rows=[race()])=>[{start:'2026-11-16',activities:rows,manual:[]}]
const life=(checks=[])=>({context:{illness_state:'well',blocked_periods:[],
 day_decisions:[],race_recovery_checks:checks,run_reviews:[],
 post_workout_feedback:[]},runs:[]})
const health=(post={})=>({
 training:{runKm7:0,previousRunKm7:40,historyStatus:'complete',truncated:false},
 metrics:[
  ...Array.from({length:13},(_,i)=>({metric_date:'2026-11-'+String(i+8).padStart(2,'0'),
   hrv_ms:50,resting_heart_rate:43,sleep_seconds:27000})),
  {metric_date:'2026-11-22',hrv_ms:post.hrv_ms??50,
   resting_heart_rate:post.resting_heart_rate??43,sleep_seconds:post.sleep_seconds??27000},
  {metric_date:'2026-11-23',hrv_ms:post.hrv_ms??50,
   resting_heart_rate:post.resting_heart_rate??43,sleep_seconds:post.sleep_seconds??27000}
 ]})
const assess=(overrides={})=>analyzeAutoRaceRecovery({
 today:'2026-11-23',goal,boards:board(),health:health(),life:life(),...overrides
})
test('before the event nothing is guessed or called a finished race',()=>{
 const result=assess({today:'2026-11-18'})
 assert.equal(result.status,'upcoming')
 assert.equal(result.matchStatus,'unavailable')
 assert.equal(result.actualMinutes,null)
 assert.equal(result.daysSince,-3)
})
test('exactly one Garmin activity, its distance/time and athlete RPE are linked conservatively',()=>{
 const result=assess()
 assert.equal(result.status,'matched')
 assert.equal(result.matchStatus,'unique')
 assert.equal(result.activityId,'heartbeat-112')
 assert.equal(result.actualMinutes,875)
 assert.equal(result.actualKm,113.1)
 assert.equal(result.garminRpe,8)
 assert.equal(result.garminFeeling,50)
 assert.equal(result.phase,'rest')
 assert.match(result.next,/mehr Ruhe/)
 assert.equal(result.recoveryCaution,true)
 assert.match(result.signals.join(' '),/sehr anstrengend/)
 assert.match(result.careNote,/kein amtliches Rennergebnis/)
})
test('duplicate Garmin import with identical activity id does not create a fake ambiguous race',()=>{
 const same={...race(),rpe_raw:90,feeling_raw:25}
 const result=assessRaceOutcome({raceDate:goal.race_date,raceDistanceKm:112,
  plannedMinutes:890,board:{activities:[race({rpe_raw:null}),same]}})
 assert.equal(result.matchStatus,'unique')
 assert.equal(result.activityId,'heartbeat-112')
 assert.equal(result.garminRpe,9)
 assert.equal(result.garminFeeling,25)
 const multi=assess({boards:board([race(),race({activity_id:'other-run'})])})
 assert.equal(multi.status,'ambiguous')
 assert.equal(multi.actualMinutes,null)
 assert.equal(multi.activityId,null)
})
test('an ordinary short run, missing distance, wrong date and cycling cannot stand in for ultra',()=>{
 const invalid=[race({distance_m:10000}),race({distance_m:null}),
  race({start_time_local:'2026-11-22 06:00:00'}),
  race({sport_type:'cycling'})]
 for(const row of invalid){
  const r=assess({boards:board([row])})
  assert.equal(r.status,'awaiting-sync')
  assert.equal(r.actualMinutes,null)
  assert.match(r.careNote,/spätere Synchronisierung/)
 }
})
test('missing or stale recovery metrics do not fabricate readiness',()=>{
 const noHealth=assess({health:{metrics:[]},boards:board([race({rpe_raw:null,feeling_raw:null})])})
 assert.equal(noHealth.status,'matched')
 assert.equal(noHealth.healthEvidence,0)
 assert.equal(noHealth.objectiveRecoveryUnknown,true)
 assert.equal(noHealth.recoveryCaution,false)
 assert.match(noHealth.careNote,/Gute Messwerte allein/)
 const after=assess({health:health()})
 assert.equal(after.healthEvidence,3)
 assert.equal(after.objectiveRecoveryUnknown,false)
})
test('real post-event HRV, resting HR and sleep deviations are caution signals, not diagnoses',()=>{
 const r=assess({
  health:health({hrv_ms:35,resting_heart_rate:54,sleep_seconds:21000}),
  boards:board([race({rpe_raw:null,feeling_raw:null})])
 })
 assert.equal(r.healthEvidence,3)
 assert.equal(r.signals.length,3)
 assert.equal(r.recoveryCaution,true)
 assert.match(r.next,/mehr Ruhe/)
})
test('warning and severe personal fatigue override an optimistic-looking Garmin record',()=>{
 const c={raceDate:'2026-11-21',reportedOn:'2026-11-23',
  fatigue:8,soreness:4,warning:true}
 const r=assess({life:life([c]),boards:board([race({rpe_raw:40,feeling_raw:100})])})
 assert.equal(r.checked,true)
 assert.equal(r.recoveryCaution,true)
 assert.match(r.signals.join(' '),/Warnzeichen/)
 assert.match(r.signals.join(' '),/hohe Belastung/)
})
test('recovery stages protect race day, first 5 days, 6-9, 10-14, then a gentle rebuild',()=>{
 for(const [today,phase] of [
  ['2026-11-21','race'],['2026-11-22','rest'],['2026-11-25','protect'],
  ['2026-11-28','observe'],['2026-12-03','return'],['2026-12-10','rebuild']
 ]){
  const r=assess({today,boards:board([race({rpe_raw:null,feeling_raw:null})])})
  assert.equal(r.phase,phase,today)
  assert.match(r.next,/Keine (weitere )?Trainingseinheit|Keine Laufeinheit|keinen Trainingsumfang|kurze, sehr lockere Einheit|Allmählich/)
 }
 const after=assess({today:'2026-12-20'})
 assert.equal(after.status,'outside')
})
test('seven-day coach uses matching race and auto caution to prevent early run proposals',()=>{
 const r=buildSevenDayCoach({today:'2026-11-23',goal:{goal},boards:board(),
  health:health(),life:life(),plans:{entries:[],historyFrom:'2026-10-01'},
  options:{options:[],choices:[]}})
 assert.equal(r.autoRaceRecovery.status,'matched')
 assert.equal(r.autoRaceRecovery.recoveryCaution,true)
 const monday=r.days.find(x=>x.date==='2026-11-23')
 assert.equal(monday.kind,'recovery')
 assert.match(monday.reason,/Garmin/)
 assert.equal(r.days.filter(x=>['easy','long','return_easy'].includes(x.kind)).length,0)
 assert.match(r.flags.join(' '),/Wettkampfnachbereitung/)
})
test('without recovery survey, Garmin postrace review remains available and does not force extra input',()=>{
 const r=buildSevenDayCoach({today:'2026-11-23',goal:{goal},
  boards:board([race({rpe_raw:50,feeling_raw:75})]),health:health(),
  life:life(),plans:{entries:[],historyFrom:'2026-10-01'},
  options:{options:[],choices:[]}})
 assert.equal(r.autoRaceRecovery.status,'matched')
 assert.equal(r.autoRaceRecovery.checked,false)
 const day=r.days[0]
 assert.equal(day.kind,'recovery')
 assert.match(day.reason,/freiwillig/)
 assert.doesNotMatch(day.reason,/Bitte Erschöpfung und Muskelgefühl im Renn-Barometer eintragen/)
})
test('read-only frontend shows race matching, Garmin feedback and optional personal check',()=>{
 const main=read('src/components/CoachSevenDay.tsx')
 const card=read('src/components/CoachRaceRecoveryCard.tsx')
 const race=read('src/components/RaceAfterActionCard.tsx')
 const coach=read('src/lib/coachSevenDay.mjs')
 const pure=read('src/lib/raceRecoveryIntelligence.mjs')
 assert.match(coach,/analyzeAutoRaceRecovery/)
 assert.match(coach,/autoRaceRecovery\.recoveryCaution/)
 assert.match(main,/<CoachRaceRecoveryCard review=\{plan.autoRaceRecovery\}/)
 assert.match(main,/Optional: persönliches Erholungs-Barometer/)
 assert.match(card,/Garmin-Aufzeichnung eindeutig zugeordnet/)
 assert.match(card,/kein amtliches Rennergebnis/)
 assert.match(card,/keine vollständige Regeneration/)
 assert.match(race,/Dein Garmin-Feedback zum Rennen/)
 assert.doesNotMatch(pure,/fetch\(|\.upsert\(|\.insert\(|postToGarmin|workoutApprove/)
 assert.doesNotMatch(card,/localStorage|\.from\(|fetch\(/)
})

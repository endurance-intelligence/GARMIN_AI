import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessRaceOutcome,listRaceDayActivities} from '../src/lib/raceOutcome.mjs'
import {analyzeAutoRaceRecovery} from '../src/lib/raceRecoveryIntelligence.mjs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',
 distance_km:112,target_hours:15}
const ultra={activity_id:'synthetic-ultra-507',activity_name:'Ultra training event',
 start_time_local:'2026-11-21 06:03:00',sport_type:'ultra_run',
 distance_m:50700,duration_s:22680,rpe_raw:80,feeling_raw:25}
const normal={activity_id:'synthetic-normal',activity_name:'Easy run',
 start_time_local:'2026-11-21 18:00:00',sport_type:'running',
 distance_m:7000,duration_s:2400,rpe_raw:20,feeling_raw:75}
const board={activities:[ultra,normal],manual:[]}
const link={raceDate:goal.race_date,raceName:goal.race_name,
 activityId:ultra.activity_id,confirmedOn:'2026-11-24'}
const assess=(extra={})=>assessRaceOutcome({
 raceDate:goal.race_date,raceName:goal.race_name,
 raceDistanceKm:goal.distance_km,plannedMinutes:900,
 board,checks:[],...extra
})
test('a 50.7km run is NOT silently declared a 112km race',()=>{
 const r=assess()
 assert.equal(r.matchStatus,'unavailable')
 assert.equal(r.actualKm,null)
 assert.equal(r.activityId,null)
 assert.equal(r.planDeltaMinutes,null)
 assert.equal(r.partial,false)
})
test('only athlete-confirmed, same-day Garmin recording can become a partial result',()=>{
 const r=assess({links:[link]})
 assert.equal(r.matchStatus,'confirmed')
 assert.equal(r.matchSource,'athlete')
 assert.equal(r.activityId,ultra.activity_id)
 assert.equal(r.actualKm,50.7)
 assert.equal(r.actualMinutes,378)
 assert.equal(r.garminRpe,8)
 assert.equal(r.garminFeeling,25)
 assert.equal(r.partial,true)
 assert.equal(r.planDeltaMinutes,null,'full-distance goal time must not be compared with partial time')
 assert.match(r.caveat,/vor Erreichen der geplanten Distanz/)
 assert.match(r.source,/bestätigte/)
})
test('wrong race name, race date, missing Garmin ID, cycling, other dates and no distance are rejected',()=>{
 for(const wrong of [
  {...link,raceDate:'2026-11-22'},
  {...link,raceName:'Other event'},
  {...link,activityId:'not-an-imported-activity'}
 ]){
  assert.equal(assess({links:[wrong]}).matchStatus,'unavailable')
 }
 const candidates=listRaceDayActivities({raceDate:goal.race_date,
  board:{activities:[
   {...ultra,sport_type:'cycling'},
   {...normal,start_time_local:'2026-11-20 07:00:00'},
   {...ultra,activity_id:'missing',distance_m:null},
   {...ultra,activity_id:'no-clock',duration_s:0}
  ]}})
 assert.deepEqual(candidates,[])
})
test('multiple runs are presented for manual selection and duplicates are deduplicated',()=>{
 const list=listRaceDayActivities({raceDate:goal.race_date,
  board:{activities:[ultra,ultra,normal]}})
 assert.equal(list.length,2)
 assert.deepEqual(list.map(x=>x.activityId),[ultra.activity_id,normal.activity_id])
 assert.equal(list[0].distanceKm,50.7)
 assert.equal(list[0].durationMinutes,378)
 assert.equal(list[0].clock,'06:03')
 assert.equal(assess({links:[{...link,activityId:normal.activity_id}]}).actualKm,7)
 assert.equal(assess({links:[{...link,activityId:normal.activity_id}]}).partial,true)
})
test('full-distance auto match and previously existing race feedback remain intact',()=>{
 const full={...ultra,distance_m:113100}
 const r=assess({board:{activities:[full]},checks:[{
  raceDate:goal.race_date,raceName:goal.race_name,reportedOn:'2026-11-23',
  fatigue:8,soreness:7,warning:true
 }]})
 assert.equal(r.matchStatus,'unique')
 assert.equal(r.partial,false)
 assert.equal(r.planDeltaMinutes,-522)
 assert.deepEqual(r.raceCheck,{reportedOn:'2026-11-23',fatigue:8,soreness:7,warning:true})
})
test('confirmed partial ultra is visible to postrace Coach and recovery days remain protected',()=>{
 const life={context:{illness_state:'well',blocked_periods:[],run_reviews:[],
  day_decisions:[],race_recovery_checks:[],race_activity_links:[link],
  post_workout_feedback:[]},runs:[]}
 const boards=[{start:'2026-11-16',...board}]
 const recovery=analyzeAutoRaceRecovery({
  today:'2026-11-24',goal,boards,health:{metrics:[]},life})
 assert.equal(recovery.status,'matched')
 assert.equal(recovery.matchStatus,'confirmed')
 assert.equal(recovery.actualKm,50.7)
 assert.equal(recovery.actualMinutes,378)
 assert.equal(recovery.phase,'protect')
 assert.equal(recovery.garminRpe,8)
 assert.match(recovery.careNote,/von dir/)
 const coach=buildSevenDayCoach({today:'2026-11-24',
  goal:{goal},boards,health:{metrics:[],training:null},
  options:{options:[],choices:[]},plans:{entries:[]},life})
 assert.equal(coach.autoRaceRecovery.status,'matched')
 assert.equal(coach.autoRaceRecovery.actualKm,50.7)
 assert.equal(coach.days[0].kind,'recovery')
 assert.equal(coach.days[0].approvable,false)
 assert.ok(coach.days.slice(0,3).every(day=>!day.approvable))
})
test('association is persistent, owner-gated and explicitly reversible, no auto Garmin/Intervals writes',()=>{
 const api=read('supabase/functions/garmin-coach-context/index.ts')
 const migration=read('supabase/migrations/20261124110000_race_activity_links_v123.sql')
 const ui=read('src/components/RaceAfterActionCard.tsx')
 const coach=read('src/lib/raceRecoveryIntelligence.mjs')
 assert.match(api,/input\.action==='confirm_race_activity'/)
 assert.match(api,/input\.action==='unlink_race_activity'/)
 assert.match(api,/input\.confirm!==true/)
 assert.match(api,/user\.email_confirmed_at/)
 assert.match(api,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(api,/db\.from\('garmin_coach_goals'\)/)
 assert.match(api,/db\.from\('garmin_coach_secondary_goals'\)/)
 assert.match(api,/db\.from\('garmin_activities'\)/)
 assert.match(api,/start_time_local/)
 assert.match(api,/race_activity_links:/)
 assert.match(api,/\.upsert\(\{\.\.\.row,user_id:user.id/)
 assert.doesNotMatch(api,/postToGarmin|postToIntervals|publishToIntervals/)
 assert.match(migration,/jsonb_typeof\(race_activity_links\)='array'/)
 assert.match(migration,/jsonb_array_length\(race_activity_links\)<=30/)
 assert.match(ui,/Diesen Garmin-Lauf dem Wettkampf zuordnen/)
 assert.match(ui,/Zuordnung wieder lösen/)
 assert.match(ui,/window\.dispatchEvent\(new Event\('garmin-ai-coach-changed'\)\)/)
 assert.match(ui,/Wettkampf vorzeitig beendet/)
 assert.match(coach,/links=Array\.isArray/)
 assert.doesNotMatch(coach,/fetch\(|upsert\(|insert\(/)
})

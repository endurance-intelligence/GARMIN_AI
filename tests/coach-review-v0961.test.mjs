import * as fsModule from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {buildActivityCoach,buildWeeklyCoach,classifyRun} from '../supabase/functions/garmin-coach-review/coachReview.mjs'
const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',distance_km:112,target_hours:15}
const hard={activity_id:'24725092836',activity_name:'ORC Track - Extensive Intervalle - 5 x 1600',sport_type:'track_running',start_time_local:'2026-11-14 09:06:54',distance_m:13200,duration_s:4134,average_heart_rate:167}
const track={fit_laps:[{intensity:'warmup',distanceM:1670,avgSpeed:2.847,avgHr:134},{intensity:'active',distanceM:1600,avgSpeed:3.668,elapsedS:436.2,avgHr:160},{intensity:'recovery',distanceM:400,avgSpeed:3.2,elapsedS:123},{intensity:'active',distanceM:1600,avgSpeed:3.668,elapsedS:436.2,avgHr:168},{intensity:'recovery',distanceM:400},{intensity:'active',distanceM:1600,avgSpeed:3.717,elapsedS:430.6,avgHr:168},{intensity:'rest',distanceM:200},{intensity:'active',distanceM:1600,avgSpeed:3.738,elapsedS:428.1,avgHr:171},{intensity:'recovery',distanceM:400},{intensity:'active',distanceM:1600,avgSpeed:3.727,elapsedS:429.3,avgHr:167},{intensity:'cooldown',distanceM:1700,avgHr:128}]}
const easy={activity_id:'1111111',activity_name:'10 k locker',sport_type:'running',start_time_local:'2026-11-12 11:16:52',distance_m:10020,duration_s:3714,average_heart_rate:131}
const easyDetail={fit_laps:[{intensity:'interval',distanceM:1000,avgSpeed:2.45,avgHr:120},{intensity:'interval',distanceM:1000,avgSpeed:2.69,avgHr:133},{intensity:'interval',distanceM:1000,avgSpeed:2.78,avgHr:134},{intensity:'interval',distanceM:1000,avgSpeed:2.62,avgHr:135},{intensity:'interval',distanceM:1000,avgSpeed:2.56,avgHr:125},{intensity:'interval',distanceM:1000,avgSpeed:2.95,avgHr:131},{intensity:'interval',distanceM:1000,avgSpeed:2.82,avgHr:147},{intensity:'interval',distanceM:1000,avgSpeed:3.13,avgHr:147},{intensity:'interval',distanceM:1000,avgSpeed:2.59,avgHr:127},{intensity:'interval',distanceM:1000,avgSpeed:2.54,avgHr:121}]}
test('five real 1600m efforts with warmup/cooldown excluded',()=>{
 const r=buildActivityCoach(hard,track,goal)
 assert.equal(r.type,'intervals')
 assert.equal(r.quality,'fit-intervals')
 assert.match(r.positive,/5 Belastungsabschnitte/)
 assert.match(r.positive,/4:33 \/ 4:28/)
 assert.match(r.attention,/160 → 167 bpm/)
 assert.match(r.goal,/7 Tagen/)
 assert.ok(!r.short.includes('Warm-up'))
})
test('easy 10k with Garmin km laps called interval is not misclassified as intervals',()=>{
 assert.equal(classifyRun(easy,easyDetail),'easy')
 const r=buildActivityCoach(easy,easyDetail,goal)
 assert.equal(r.type,'easy')
 assert.match(r.positive,/Ø 131 bpm/)
 assert.match(r.attention,/konfigurierten HF-Zonen und dein Empfinden/)
 assert.doesNotMatch(r.headline,/Intervalle/)
})
test('missing FIT laps produces limited judgement not a made-up grading',()=>{
 const r=buildActivityCoach(hard,{},goal)
 assert.equal(r.quality,'limited')
 assert.match(r.positive,/nicht eindeutig/)
 assert.doesNotMatch(r.positive,/konstante Wiederholungen/)
})
test('weekly review compares same weekly distance, and includes football without double-counting',()=>{
 const soccer={activity_id:'44444',sport_type:'soccer',start_time_local:'2026-11-09 19:00:00',distance_m:6500,duration_s:5000}
 const old={activity_id:'22222',sport_type:'running',start_time_local:'2026-11-05 10:00:00',distance_m:6870,duration_s:3000,activity_name:'6.8 locker'}
 const w=buildWeeklyCoach([hard,easy,soccer,old],{[hard.activity_id]:track},goal,'2026-11-09')
 assert.equal(w.runCount,2)
 assert.equal(w.distanceKm,23.22)
 assert.equal(w.previousKm,6.87)
 assert.equal(w.footballCount,1)
 assert.equal(w.intervalCount,1)
 assert.match(w.next,/Taper/)
 assert.match(w.observation,/Fußball/)
})
test('only a valid future goal triggers race-day advice',()=>{
 const a=buildActivityCoach(hard,track,null)
 assert.match(a.goal,/Hauptziel nicht verfügbar/)
 const later=buildActivityCoach({...hard,start_time_local:'2026-12-02 11:00:00'},track,goal)
 assert.match(later.goal,/bereits zurück/)
})
test('real reviews are visible in day calendar, coach week and session analyst',()=>{
 const fs=requireSourceFiles()
 assert.ok(fs.calendar.includes('<CoachEvidenceSummary active={active} mode="calendar" weekStart={start} selectedDate={selected}/>'))
 assert.ok(fs.coach.includes('<CoachEvidenceSummary active={active} mode="weekly"'))
 assert.ok(fs.analyst.includes('<CoachEvidenceSummary active={active} mode="training" activityId={details.activity.id}/>'))
 assert.ok(fs.component.includes("garmin-coach-review"))
 assert.ok(fs.server.includes("auth.auth.getUser(bearer[1])"))
 assert.ok(fs.server.includes(".eq('user_id',user.id)"))
 assert.ok(fs.server.includes("fit_laps"))
 assert.ok(!fs.server.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''") || fs.server.includes("getUser"))
})
function requireSourceFiles(){
 const {readFileSync}=fsModule
 const get=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8')
 return {calendar:get('src/pages/CalendarPage.tsx'),coach:get('src/pages/CoachPage.tsx'),
  analyst:get('src/components/LiveSessionAnalyst.tsx'),component:get('src/components/CoachEvidenceSummary.tsx'),
  server:get('supabase/functions/garmin-coach-review/index.ts')}
}

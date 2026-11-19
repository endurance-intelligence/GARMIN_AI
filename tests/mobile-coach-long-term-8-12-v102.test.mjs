import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeCoachLongTerm,longTermWeekStarts} from '../src/lib/coachLongTerm.mjs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-19'
const starts=longTermWeekStarts(today,12)
const makeBoard=(start,index,km=40,rpe=40)=>({
 start,activities:[
  {activity_id:'long-'+index,start_time_local:start+' 09:00:00',
   sport_type:'running',distance_m:km*600,duration_s:5100,
   rpe_raw:rpe,feeling_raw:75},
  {activity_id:'easy-'+index,start_time_local:start+' 19:00:00',
   sport_type:'running',distance_m:km*400,duration_s:2700,
   rpe_raw:rpe,feeling_raw:75}
 ],manual:[]
})
const boards=starts.map((w,i)=>makeBoard(w,i))
const plans={entries:[],historyFrom:'2026-10-05'}
const analyze=(weekCount=8,which=boards,other={})=>analyzeCoachLongTerm({
 today,boards:which,plans,life:{context:{day_decisions:[]}},
 weeks:weekCount,raceDate:'2027-04-25',...other
})
test('8 and 12 weeks are complete ISO Monday starts, never include current partial week',()=>{
 assert.deepEqual(starts.slice(0,3),['2026-11-09','2026-11-02','2026-10-26'])
 assert.equal(starts.length,12)
 assert.equal(starts.at(-1),'2026-08-24')
 assert.equal(longTermWeekStarts(today,8).length,8)
 assert.deepEqual(longTermWeekStarts('2026-11-31',8),[])
 assert.deepEqual(longTermWeekStarts(today,6),[])
})
test('8 real measured Garmin weeks use 4 vs 4 weekly medians with no invented fitness index',()=>{
 const r=analyze()
 assert.equal(r.status,'ready')
 assert.equal(r.completeWeeks,8)
 assert.equal(r.measuredWeeks,8)
 assert.equal(r.blocks.length,2)
 assert.equal(r.currentMedianKm,40)
 assert.equal(r.previousMedianKm,40)
 assert.equal(r.changePct,0)
 assert.equal(r.trend,'stable')
 assert.equal(r.rpe.count,16)
 assert.equal(r.rpe.low,16)
 assert.equal(r.rpe.moderate,0)
 assert.equal(r.longRunsMeasured,8)
 assert.match(r.advice,/keine Trainingsfreigabe/)
 assert.equal(r.readOnly,true)
 assert.doesNotMatch(JSON.stringify(r),/fitnessScore|trainingLoadIndex|timeInZone/)
})
test('12 weeks yield three separate actual four-week blocks with no extrapolation',()=>{
 const r=analyze(12)
 assert.equal(r.status,'ready')
 assert.equal(r.completeWeeks,12)
 assert.equal(r.blocks.length,3)
 assert.deepEqual(r.blocks.map(b=>b.medianKm),[40,40,40])
 assert.equal(r.oldestMedianKm,40)
 assert.equal(r.reviewedRpe,24)
 assert.equal(r.weeks[11].start,'2026-08-24')
})
test('volume rise over 30 percent triggers caution, not more intensity',()=>{
 const changed=boards.map((b,i)=>i<4?makeBoard(b.start,i,60):b)
 const r=analyze(8,changed)
 assert.equal(r.changePct,50)
 assert.equal(r.trend,'up')
 assert.ok(r.flags.some(f=>/Umfangsanstieg/.test(f)))
 assert.match(r.advice,/Regeneration prüfen/)
})
test('fall in running volume is not converted to a catch-up workout',()=>{
 const changed=boards.map((b,i)=>i<4?makeBoard(b.start,i,20):b)
 const r=analyze(8,changed)
 assert.equal(r.changePct,-50)
 assert.equal(r.trend,'down')
 assert.ok(r.flags.some(f=>/[kK]eine.*nachholen/.test(f)))
 assert.doesNotMatch(JSON.stringify(r),/targetKm|extraMiles|createWorkout/)
})
test('missing older weekly boards are UNKNOWN rather than fabricated zero-kilometer training weeks',()=>{
 const partial=analyze(12,boards.slice(0,7))
 assert.equal(partial.status,'partial')
 assert.equal(partial.completeWeeks,7)
 assert.equal(partial.measuredWeeks,7)
 assert.equal(partial.weeks[7].available,false)
 assert.equal(partial.weeks[7].distanceKm,null)
 assert.equal(partial.oldestMedianKm,null)
 assert.equal(partial.blocks[2].medianKm,null)
})
test('missing Garmin distance in one run makes the week unknown for mileage trend',()=>{
 const broken=boards.map((b,i)=>i===0?{
  ...b,activities:b.activities.map((a,j)=>j===1?{...a,distance_m:null}:a)
 }:b)
 const r=analyze(8,broken)
 assert.equal(r.status,'partial')
 assert.equal(r.measuredWeeks,7)
 assert.equal(r.weeks[0].distanceKm,null)
 assert.equal(r.changePct,null)
 assert.equal(r.trend,'unknown')
 assert.equal(r.rpe.count,16)
})
test('missing RPE never becomes low intensity or Garmin 80/20 evidence',()=>{
 const sparse=boards.map((b,i)=>({
  ...b,activities:b.activities.map((a,j)=>({
   ...a,rpe_raw:i===0&&j===0?90:null,feeling_raw:null
  }))
 }))
 const r=analyze(8,sparse)
 assert.equal(r.rpe.count,1)
 assert.equal(r.rpe.high,1)
 assert.equal(r.rpe.low,0)
 assert.equal(r.rpe.missing,15)
 assert.ok(r.rpe.count<r.weeks.slice(0,8).reduce((n,w)=>n+(w.runs||0),0))
})
test('two strenuous recent weeks trigger a careful warning without claiming LT1 zones',()=>{
 const hard=boards.map((b,i)=>i<2?makeBoard(b.start,i,40,90):b)
 const r=analyze(8,hard)
 assert.ok(r.flags.some(f=>/harten|RPE|Gefühl/.test(f)))
 assert.equal(r.hardWeeks,2)
 assert.equal(r.rpe.high,4)
})
test('Garmin re-import and football do not inflate weekly running totals or RPE distribution',()=>{
 const doubled=boards.map((b,i)=>i===0?{
  ...b,activities:[...b.activities,b.activities[0],{
   ...b.activities[0],activity_id:'football',sport_type:'soccer',distance_m:20000
  }]
 }:b)
 const r=analyze(8,doubled)
 assert.equal(r.weeks[0].runs,2)
 assert.equal(r.weeks[0].distanceKm,40)
 assert.equal(r.rpe.count,16)
})
test('Heartbeat race phase is explicitly protected from a history-based volume suggestion',()=>{
 const r=analyze(8,boards,{raceDate:'2026-11-21'})
 assert.equal(r.raceProtected,true)
 assert.match(r.title,/Wettkampfphase/)
 assert.match(r.advice,/keine zusätzliche Belastung/)
 const after=analyze(8,boards,{raceDate:'2026-11-12'})
 assert.equal(after.raceProtected,true)
})
test('even complete 8/12-week evidence does not modify the existing 7-day Coach suggestions',()=>{
 const input={today,boards:boards.slice(0,4),plans,
  goal:{goal:{race_date:'2026-11-21',race_name:'Heartbeat',distance_km:112}},
  health:{training:{runKm7:41,previousRunKm7:42,historyStatus:'complete',truncated:false},
   metrics:[]},life:{context:{illness_state:'well',blocked_periods:[],
    day_decisions:[],race_recovery_checks:[],run_reviews:[],post_workout_feedback:[]},runs:[]},
  options:{options:[],choices:[]}}
 const before=buildSevenDayCoach(input)
 const review=analyze(12,boards,{raceDate:'2026-11-21'})
 const after=buildSevenDayCoach(input)
 assert.equal(review.raceProtected,true)
 assert.deepEqual(after.days,before.days)
 assert.deepEqual(after.adaptiveVolume,before.adaptiveVolume)
})
test('UI loads additional weeks on demand, remains owner authenticated, no change to default 4-week Coach fetch',()=>{
 const card=read('src/components/CoachLongTermCard.tsx')
 const coach=read('src/components/CoachSevenDay.tsx')
 const snapshot=read('src/lib/coachSnapshot.ts')
 const page=read('src/pages/CoachPage.tsx')
 const api=read('supabase/functions/garmin-week-board/index.ts')
 const module=read('src/lib/coachLongTerm.mjs')
 assert.match(coach,/<CoachLongTermCard today=\{today\} snapshot=\{snapshot\} active=\{active\}\/>/)
 assert.match(card,/if\(!active\|\|!expanded\|\|!garminSupabase\)return/)
 assert.match(card,/garminSupabase\.auth\.getSession\(\)/)
 assert.match(card,/garmin-week-board\?start=/)
 assert.match(card,/Promise\.allSettled\(/)
 assert.match(card,/Fehlende Wochen erneut laden/)
 assert.match(card,/Polarisiertes Training:/)
 assert.match(card,/keine 80\/20-Quote berechnet/)
 assert.match(snapshot,/Math\.min\(4,historyWeeks\)/)
 assert.match(page,/loadCoachSnapshot\(session,berlinToday\(\),abort\.signal,undefined,4\)/)
 assert.match(api,/const earliest=plusDays\(today,-180\)/)
 assert.match(api,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.doesNotMatch(module,/fetch\(|\.insert\(|\.upsert\(|createWorkout|postToGarmin/)
})

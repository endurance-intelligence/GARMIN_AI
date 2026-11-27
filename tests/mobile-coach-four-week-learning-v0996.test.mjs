import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeCoachFourWeeks} from '../src/lib/coachFourWeeks.mjs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
import {applyPolarizedGuidance} from '../src/lib/polarizedTraining.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-18'
const weeks=['2026-11-09','2026-11-02','2026-10-26','2026-10-19']
const dates=['2026-11-10','2026-11-03','2026-10-27','2026-10-20']
const run=(day,id,rpe,feeling=75)=>({
 activity_id:id,activity_name:'Garmin · locker',start_time_local:day+' 19:10:00',
 sport_type:'running',duration_s:2400,distance_m:6200,average_heart_rate:132,
 rpe_raw:rpe,feeling_raw:feeling
})
const extra=(day,id,rpe)=>({
 ...run(day,id,rpe),start_time_local:day+' 07:00:00'
})
const plan=(day,id)=>({
 id,training_date:day,title:'Coach · locker',sport:'running',state:'pending',
 archive_snapshot:{sourceKind:'coach',coachKind:'easy',startTime:'19:00',
  warmup:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:1800}]},
  cooldown:{durationSeconds:300}}
})
const boards=weeks.map((start,i)=>({start,activities:[
 run(dates[i],'planned-'+i,i<2?90:50),extra(start,'extra-'+i,i<2?50:40)
 ],manual:[]}))
const plans=dates.map((date,i)=>plan(date,'p-'+i))
const life={context:{day_decisions:[
 {date:'2026-11-10',choice:'accepted'},
 {date:'2026-11-11',choice:'declined'},
 {date:'2026-11-03',choice:'accepted'},
 {date:'2026-10-27',choice:'declined'}
]}}
const analyze=(b=boards,p=plans,l=life,historyFrom='2026-10-01')=>
 analyzeCoachFourWeeks({today,boards:b,plans:{entries:p,historyFrom},life:l})
test('four completed ISO weeks separate decisions, approved plans, real Garmin runs and measured RPE',()=>{
 const result=analyze()
 assert.equal(result.status,'ready')
 assert.deepEqual(result.weeks.map(w=>w.start),weeks)
 assert.equal(result.completeWeeks,4)
 assert.equal(result.totalRuns,8)
 assert.equal(result.totalRated,8)
 assert.equal(result.totalMatched,4)
 assert.equal(result.weeks[0].runs,2)
 assert.equal(result.weeks[0].accepted,1)
 assert.equal(result.weeks[0].declined,1)
 assert.equal(result.weeks[0].approved,1)
 assert.equal(result.weeks[0].matched,1)
 assert.equal(result.weeks[0].distanceKm,12.4)
 assert.equal(result.weeks[0].hard,1)
 assert.equal(result.weeks[0].rated,2)
 assert.equal(result.qualityCaution,true)
 assert.equal(result.repeatedToughWeeks,2)
})
test('a dated Coach acceptance is never described as an executed Garmin training',()=>{
 const output=analyze(boards,[],life)
 assert.equal(output.weeks[0].accepted,1)
 assert.equal(output.weeks[0].matched,0)
 assert.equal(output.weeks[0].runs,2)
 assert.equal(output.totalMatched,0)
 const noRuns=analyze(boards.map(b=>({...b,activities:[]})),[],life)
 assert.equal(noRuns.weeks[0].accepted,1)
 assert.equal(noRuns.weeks[0].runs,0)
 assert.equal(noRuns.weeks[0].matched,0)
})
test('missing week stays unknown and not a fictional zero-run week',()=>{
 const result=analyze(boards.slice(0,3))
 assert.equal(result.status,'partial')
 assert.equal(result.completeWeeks,3)
 assert.equal(result.weeks[3].available,false)
 assert.equal(result.weeks[3].runs,null)
 assert.equal(result.weeks[3].approved,null)
 const onlyOne=analyze([boards[0]])
 assert.equal(onlyOne.qualityCaution,false)
})
test('missing historic plan coverage must not be counted as an absent or completed plan',()=>{
 const review=analyze(boards,plans,life,'2026-11-01')
 assert.equal(review.status,'partial')
 assert.equal(review.weeks[0].matched,1)
 assert.equal(review.weeks[1].matched,1)
 assert.equal(review.weeks[2].matched,null)
 assert.equal(review.weeks[3].approved,null)
 assert.equal(review.totalMatched,null)
 const noMetadata=analyzeCoachFourWeeks({
  today,boards,plans:{entries:plans},life
 })
 assert.equal(noMetadata.totalMatched,null)
 assert.equal(noMetadata.qualityCaution,true)
})
test('missing Garmin RPE/feeling yields no fabricated hard feedback or artificial readiness',()=>{
 const unknown=boards.map(b=>({...b,activities:b.activities.map(a=>({
  ...a,rpe_raw:null,feeling_raw:null
 }))}))
 const review=analyze(unknown)
 assert.equal(review.totalRuns,8)
 assert.equal(review.totalRated,0)
 assert.equal(review.qualityCaution,false)
 assert.match(review.explanation,/keine Garmin-RPE/)
})
test('one bad week does not suppress a hard option; two distinct recent tough weeks can',()=>{
 const one=boards.map((b,i)=>({...b,activities:b.activities.map(a=>({
  ...a,rpe_raw:i===0?90:40,feeling_raw:75
 }))}))
 assert.equal(analyze(one).qualityCaution,false)
 assert.equal(analyze(boards).qualityCaution,true)
 const oldOnly=boards.map((b,i)=>({...b,activities:b.activities.map(a=>({
  ...a,rpe_raw:i>=2?90:50,feeling_raw:75
 }))}))
 assert.equal(analyze(oldOnly).qualityCaution,false)
})
test('two runs on same day create ambiguous match, not false plan success',()=>{
 const extraSameDay=boards.map((b,i)=>i!==0?b:{...b,activities:[
  ...b.activities,extra(dates[0],'another-same-day',40)
 ]})
 const result=analyze(extraSameDay)
 assert.equal(result.weeks[0].runs,3)
 assert.equal(result.weeks[0].matched,0)
 assert.equal(result.totalMatched,3)
})
test('Garmin non-running and duplicate imports cannot inflate weekly run totals',()=>{
 const duplicated=boards.map((b,i)=>i!==0?b:{...b,activities:[
  ...b.activities,b.activities[0],{...b.activities[0],
   activity_id:'football',sport_type:'soccer',distance_m:20000}
 ]})
 const r=analyze(duplicated)
 assert.equal(r.weeks[0].runs,2)
 assert.equal(r.weeks[0].distanceKm,12.4)
})
test('protected Coach quality guard never changes existing or selected workouts',()=>{
 const template=[
  {date:'2026-11-18',kind:'option',title:'ORC Track Intervalle',approvable:false,minutes:null,reason:'Optional',sport:'running'},
  {date:'2026-11-19',kind:'chosen',title:'ORC Track',approvable:false,minutes:null,reason:'Selected',sport:'running'},
  {date:'2026-11-20',kind:'existing',title:'Freigegebenes Workout',approvable:false,minutes:null,reason:'Saved',sport:'running'}
 ]
 const locked=applyPolarizedGuidance(template,{today,raceDate:null,
  qualityLocked:analyze().qualityCaution,observationLimited:false})
 // Selected ORC Track keeps the reserved slot, but no NEW hard session is suggested.
 assert.equal(locked.qualityDay,'2026-11-19')
 assert.equal(locked.status,'protected')
 assert.equal(locked.days[1].kind,'chosen')
 assert.equal(locked.days[2].title,'Freigegebenes Workout')
 assert.equal(locked.days[0].intensityIntent,'low-option')
})
test('7-day Coach explicitly considers four-week risk without replacing personal approval',()=>{
 const d=buildSevenDayCoach({today,
  boards,plans:{entries:plans,historyFrom:'2026-10-01'},life:{
   context:{illness_state:'well',blocked_periods:[],day_decisions:life.context.day_decisions,
    run_reviews:[],race_recovery_checks:[],post_workout_feedback:[]},runs:[]},
  options:{options:[],choices:[]},
  health:{training:{runKm7:35,previousRunKm7:34,historyStatus:'complete',truncated:false},
   metrics:Array.from({length:18},(_,i)=>({metric_date:'2026-11-'+String(i+1).padStart(2,'0'),
    hrv_ms:50,resting_heart_rate:43,sleep_seconds:27000}))},
  goal:{goal:{race_date:'2027-04-25',race_name:'Hermannslauf',distance_km:31.1}}
 })
 assert.equal(d.fourWeekReview.qualityCaution,true)
 assert.equal(d.trainingMethod.status,'protected')
 assert.match(d.flags.join(' '),/Vierwochen-Verlauf/)
 assert.match(d.attentionText,/Über mehrere Wochen|Garmin-Bewertungen/)
 assert.equal(d.days.every(x=>x.decision!=='accepted'||!x.approvable),true)
})
test('Coach fetches 4 actual weeks and backend keeps a 45-day plan window and 120-day decisions',()=>{
 const coach=read('src/pages/CoachPage.tsx')
 const fallback=read('src/components/CoachSevenDay.tsx')
 const context=read('supabase/functions/garmin-coach-context/index.ts')
 const planApi=read('supabase/functions/garmin-training-plan/index.ts')
 const snapshot=read('src/lib/coachSnapshot.ts')
 const view=read('src/components/CoachFourWeekCard.tsx')
 assert.match(coach,/loadCoachSnapshot\(session,berlinToday\(\),abort\.signal,undefined,4\)/)
 assert.match(fallback,/loadCoachSnapshot\(session,today,controller\.signal,undefined,4\)/)
 assert.match(fallback,/<CoachFourWeekCard today=\{today\} snapshot=\{snapshot\}/)
 assert.match(snapshot,/garmin-coach-archive\?week=/)
 assert.match(read('supabase/functions/_shared/coach-archive-reader.ts'),/historyFrom:since/)
 assert.match(read('supabase/functions/_shared/coach-archive-reader.ts'),/length:4/)
 assert.match(planApi,/45\*86400000/)
 assert.match(planApi,/historyFrom:since/)
 assert.match(context,/const oldest=plusDays\(today,-119\)/)
 assert.match(context,/d\.date>=oldest/)
 assert.match(view,/Ein Klick auf „Annehmen“ ist kein/)
 assert.match(view,/keine künstlichen Fitness-Scores/)
 assert.doesNotMatch(read('src/lib/coachFourWeeks.mjs'),/fetch\(|\.upsert\(|\.insert\(/)
})

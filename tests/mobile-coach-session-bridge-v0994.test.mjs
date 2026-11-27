import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildCoachSessionBridge} from '../src/lib/coachSessionBridge.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const day='2026-11-18'
const coachPlan=(date='2026-11-17',start='19:00')=>({
 id:'p1',training_date:date,title:'Coach · lockerer Lauf',sport:'running',state:'pending',
 archive_snapshot:{sourceKind:'coach',coachKind:'easy',startTime:start,
  warmup:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:1200}]},
  cooldown:{durationSeconds:300}}
})
const run=(id='g1',date='2026-11-17',time='19:12:00',more={})=>({
 activity_id:id,start_time_local:date+' '+time,activity_name:'Garmin locker',
 sport_type:'running',duration_s:1980,distance_m:5200,average_heart_rate:133,
 rpe_raw:70,feeling_raw:75,...more
})
const build=(boards,plans=[coachPlan()])=>buildCoachSessionBridge({boards,plans,today:day})
test('Coach and Session use identical conservative Plan-Ist matcher',()=>{
 const a=run()
 const b=build([{activities:[a]}])
 assert.equal(b.status,'ready')
 assert.equal(b.totalRuns,1)
 assert.equal(b.matchedCount,1)
 assert.equal(b.items[0].match.status,'matched')
 assert.equal(b.items[0].match.plan.plannedMinutes,30)
 assert.equal(b.items[0].match.plan.actualMinutes,33)
 assert.equal(b.items[0].match.plan.durationDeltaMinutes,3)
 assert.equal(b.items[0].rpe,7)
 assert.equal(b.items[0].feeling,'Gut')
})
test('same-day second Garmin run means no matched plan even when one starts perfectly',()=>{
 const b=build([{activities:[run(),run('g2','2026-11-17','20:30:00')]}])
 assert.equal(b.matchedCount,0)
 assert.ok(b.items.every(x=>x.match.status==='ambiguous'))
})
test('only pending or confirmed Coach workouts count; drafts and unknown workouts stay unlinked',()=>{
 const a=run()
 const draft=build([{activities:[a]}],[{...coachPlan(),state:'draft'}])
 assert.equal(draft.items[0].match.status,'no-plan')
 assert.equal(draft.matchedCount,0)
 const late=build([{activities:[run('g3','2026-11-17','23:30:00')]}])
 assert.equal(late.items[0].match.status,'possible')
 const lap=coachPlan()
 lap.archive_snapshot.group.steps[0].endMode='lap'
 assert.equal(build([{activities:[a]}],[lap]).items[0].match.status,'unsupported')
})
test('deduplicate Garmin rows across calendar boards, prefer actual measured evidence, no future entries',()=>{
 const thin=run('g1','2026-11-17','19:12:00',{
  duration_s:null,distance_m:null,average_heart_rate:null,rpe_raw:null})
 const rich=run()
 const b=build([{activities:[thin]},{activities:[rich,run('future','2026-11-19')]}])
 assert.equal(b.totalRuns,1)
 assert.equal(b.items[0].durationMinutes,33)
 assert.equal(b.items[0].rpe,7)
})
test('no fabrication of missing RPE, feeling, distance, matching, or runs',()=>{
 const empty=build([{activities:[]}])
 assert.equal(empty.status,'empty')
 assert.equal(empty.totalRuns,0)
 const a=run('no-data','2026-11-17','16:00:00',{
  rpe_raw:null,feeling_raw:null,duration_s:null,distance_m:null})
 const b=build([{activities:[a]}],[])
 assert.equal(b.items[0].rpe,null)
 assert.equal(b.items[0].feeling,null)
 assert.equal(b.items[0].distanceKm,null)
 assert.equal(b.items[0].durationMinutes,null)
 assert.equal(b.items[0].match.status,'no-plan')
 const unavailable=buildCoachSessionBridge({boards:null,plans:[],today:day})
 assert.equal(unavailable.status,'unavailable')
 assert.equal(unavailable.totalRuns,null)
})
test('non-running sport and manual workouts cannot masquerade as Garmin runs',()=>{
 const board={activities:[run('soccer','2026-11-17','19:00:00',{sport_type:'soccer'})],
  manual:[{session_date:'2026-11-17',kind:'running'}]}
 const b=build([board])
 assert.equal(b.totalRuns,0)
})
test('Coach displays recent Garmin sessions and deep-links exact activity through app router',()=>{
 const bridge=read('src/components/CoachSessionBridge.tsx')
 const pure=read('src/lib/coachSessionBridge.mjs')
 const coach=read('src/pages/CoachPage.tsx')
 const app=read('src/App.tsx')
 const training=read('src/pages/TrainingPage.tsx')
 const analyst=read('src/components/LiveSessionAnalyst.tsx')
 const css=read('src/styles/coach-session-bridge.css')
 assert.match(pure,/assessPlanActual\(activity,activities,plans\)/)
 assert.match(pure,/normalizeGarminRpe\(row\.rpe_raw\)/)
 assert.match(bridge,/onOpenSession\(item\.id\)/)
 assert.match(bridge,/Keine automatische Trainingsbewertung, Planänderung/)
 assert.doesNotMatch(coach,/<CoachSessionBridge/)
 assert.match(read('src/components/TrainingDevelopment.tsx'),/<CoachSessionBridge snapshot=\{snapshot\}/)
 assert.match(app,/setSessionFocus\(prev=>\(\{activityId,token:/)
 assert.match(app,/go\('training'\)/)
 assert.match(training,/<LiveSessionAnalyst active=\{active&&view==='session'\} focus=\{focus\}\/\>/)
 assert.match(analyst,/const requested=focus\?\.activityId\|\|''/)
 assert.match(analyst,/setSelected\(requested\)/)
 assert.match(analyst,/Es wird kein anderer Lauf stillschweigend geöffnet/)
 assert.match(css,/@media\(max-width:650px\)/)
 assert.doesNotMatch(pure,/fetch\(|\.upsert\(|\.insert\(|\.update\(/)
})

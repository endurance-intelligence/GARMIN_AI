import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeArchivedWeeks,applyArchivedWeekLearning} from '../src/lib/archivedWeekLearning.mjs'
const today='2026-12-21',starts=['2026-12-14','2026-12-07','2026-11-30','2026-11-23']
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const revision=(start,km,extra={})=>({id:start+km,week_start:start,created_at:start+'T08:00:00Z',snapshot:{schema:1,weekStart:start,partial:false,phase:'Aufbau',entries:[{date:start,kind:'running',source:'approved',km,minutes:120,title:'Lauf'}],...extra}})
const board=(start,km=36,rpe=80)=>({start,manual:[],activities:[{activity_id:start+'a',sport_type:'running',start_time_local:start+'T18:00',distance_m:km*500,duration_s:5400,rpe_raw:rpe},{activity_id:start+'b',sport_type:'running',start_time_local:shift(start,2)+'T18:00',distance_m:km*500,duration_s:5400,rpe_raw:40}]})
const fixture=()=>({today,boards:starts.map(s=>board(s)),revisions:starts.map(s=>revision(s,28))})
test('two or more comparable recent weeks above plan and high subjective strain trigger caution',()=>{
 const result=analyzeArchivedWeeks(fixture())
 assert.equal(result.caution,true);assert.equal(result.completeWeeks,4);assert.equal(result.overloadWeeks,4);assert.equal(result.weeks[0].deltaKm,8)
})
test('no fabricated history or adjustment from partial or unknown records, race, easy ratings or old signals',()=>{
 const x=fixture()
 assert.equal(analyzeArchivedWeeks({today}).caution,false)
 assert.equal(analyzeArchivedWeeks({...x,revisions:starts.map(s=>revision(s,28,{partial:true}))}).completeWeeks,0)
 assert.equal(analyzeArchivedWeeks({...x,revisions:starts.map(s=>revision(s,28,{phase:'Entlastungswoche'}))}).caution,false)
 assert.equal(analyzeArchivedWeeks({...x,boards:starts.map(s=>board(s,36,40))}).caution,false)
 assert.equal(analyzeArchivedWeeks({...x,boards:starts.map((s,i)=>board(s,i<2?28:36))}).caution,false)
 const missing=fixture();missing.revisions[0].snapshot.entries[0].km=null
 assert.equal(analyzeArchivedWeeks(missing).weeks[0].status,'incomplete')
})
test('initial and latest versions are compared independently, not counted as separate weeks',()=>{
 const x=fixture();x.revisions.push({...revision(starts[0],34),created_at:starts[0]+'T20:00:00Z'})
 const w=analyzeArchivedWeeks(x).weeks[0]
 assert.equal(w.originalKm,28);assert.equal(w.plannedKm,34);assert.equal(w.actualKm,36);assert.equal(w.overload,false)
})
test('one conservative five minute revision only of open easy run, never saved or protected days',()=>{
 const review=analyzeArchivedWeeks(fixture())
 const days=[{date:today,kind:'existing',sport:'running',minutes:40,approvable:false},{date:shift(today,1),kind:'easy',sport:'running',minutes:40,approvable:true,reason:'Locker'},{date:shift(today,2),kind:'easy',sport:'running',minutes:40,approvable:true,reason:'Locker'}]
 const out=applyArchivedWeekLearning(days,review,{today})
 assert.equal(out.days[0],days[0]);assert.equal(out.days[1].minutes,35);assert.equal(out.days[2],days[2]);assert.equal(days[1].minutes,40)
 for(const opts of [{protectedPhase:true},{otherAdjustment:true}])assert.equal(applyArchivedWeekLearning(days,review,{today,...opts}).appliedDate,null)
})
test('owner-only bounded historical versions drive the canonical Coach, with actual effects and visible evidence',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const reader=read('supabase/functions/_shared/coach-archive-reader.ts'),coach=read('src/lib/coachSevenDay.mjs')
 assert.match(reader,/from\('garmin_weekly_plan_history'\).*eq\('user_id',userId\).*eq\('week_start',start\).*limit\(1\)/)
 assert.match(coach,/analyzeArchivedWeeks\(\{today,boards:input.boards,revisions:input.life\?\.weekRevisions\}\)/)
 assert.match(coach,/\}:guardedVolume/)
 assert.match(coach,/applyArchivedWeekLearning\(toleranceStep.days,archivedLearning/)
 assert.match(coach,/qualityLocked:archivedLearning.caution/)
 assert.match(read('src/pages/CoachPage.tsx'),/<ArchivedWeekLearningCard review=\{dailyPlan.archivedLearning\}/)
})

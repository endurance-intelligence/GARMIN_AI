import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeCoachFourWeeks} from '../src/lib/coachFourWeeks.mjs'
import {applyWorkoutToleranceGuidance} from '../src/lib/coachWorkoutTolerance.mjs'
import {analyzeAdaptiveVolume} from '../src/lib/coachAdaptiveVolume.mjs'

const today='2026-11-24'
const starts=['2026-11-16','2026-11-09','2026-11-02','2026-10-26']
const fixture=(ratings=[90,90,40,40],kind='easy')=>({
 today,boards:starts.map((start,i)=>({start,activities:[{
  activity_id:'a'+i,sport_type:'running',start_time_local:start+' 19:10:00',duration_s:2400,distance_m:6000,
  rpe_raw:ratings[i],feeling_raw:75
 }]})),
 plans:{historyFrom:'2026-10-01',entries:starts.map((start,i)=>({
  id:'p'+i,training_date:start,title:'Coach',sport:'running',state:'confirmed',
  archive_snapshot:{sourceKind:'coach',coachKind:kind,startTime:'19:00',warmup:{durationSeconds:300},
   group:{steps:[{endMode:'time',durationSeconds:1800}]},cooldown:{durationSeconds:300}}
 }))}
})
const day=(date,kind='easy',over={})=>({date,kind,title:'Original',minutes:kind==='long'?65:40,reason:'Grundlage',sport:'running',approvable:true,...over})
test('current repeated same-type signals are actionable; old or partial history is not',()=>{
 assert.deepEqual(analyzeCoachFourWeeks(fixture()).lowIntensityCautionKinds,['easy'])
 assert.deepEqual(analyzeCoachFourWeeks(fixture([40,40,90,90])).lowIntensityCautionKinds,[])
 assert.deepEqual(analyzeCoachFourWeeks(fixture([90,90,40,40],'intervals')).lowIntensityCautionKinds,[])
 const f=fixture();f.boards.pop()
 assert.deepEqual(analyzeCoachFourWeeks(f).lowIntensityCautionKinds,[])
})
test('only first open matching workout is shortened; calendar and other types stay intact',()=>{
 const days=[day('2026-11-24','easy',{decision:'accepted',approvable:false}),day('2026-11-25','long'),
  day('2026-11-26'),day('2026-11-27'),day('2026-11-28','existing')]
 const x=applyWorkoutToleranceGuidance(days,analyzeCoachFourWeeks(fixture()),{today})
 assert.equal(x.appliedDate,'2026-11-26')
 assert.equal(x.days[2].minutes,35)
 assert.match(x.days[2].reason,/2 von 4/)
 for(const i of [0,1,3,4])assert.equal(x.days[i],days[i])
 assert.equal(days[2].minutes,40)
})
test('long signal reduces only long run and does not stack or override protected phase',()=>{
 const history=analyzeCoachFourWeeks(fixture([90,90,40,40],'long'))
 const days=[day(today),day('2026-11-29','long')]
 const x=applyWorkoutToleranceGuidance(days,history,{today})
 assert.equal(x.days[1].minutes,55)
 assert.equal(x.days[1].kind,'easy')
 for(const guard of [{protectedPhase:true},{otherAdjustment:true}]){
  const y=applyWorkoutToleranceGuidance(days,history,{today,...guard})
  assert.equal(y.days,days);assert.equal(y.appliedDate,null)
 }
})
test('past days, minimum duration, declined choices and outside horizon stay unchanged',()=>{
 const history=analyzeCoachFourWeeks(fixture())
 const days=[day('2026-11-23'),day(today,'easy',{minutes:20}),day('2026-11-25','easy',{decision:'declined'}),day('2026-12-01')]
 assert.equal(applyWorkoutToleranceGuidance(days,history,{today}).days,days)
})
test('type-specific caution blocks new volume progress and reaches the shared seven-day coach',()=>{
 const history=analyzeCoachFourWeeks(fixture())
 assert.equal(analyzeAdaptiveVolume({today,history}).status,'protected')
 const source=readFileSync(new URL('../src/lib/coachSevenDay.mjs',import.meta.url),'utf8')
 assert.match(source,/applyWorkoutToleranceGuidance\(volumeStep.days,fourWeekReview/)
 assert.match(source,/qualityLocked:archivedLearning.caution\|\|garminPerception.qualityCaution\|\|fourWeekReview.qualityCaution\|\|typeCaution/)
 assert.match(source,/recentRaceOffset>=-14/)
 assert.match(source,/otherAdjustment:allowWeekAdjustment\|\|adapted.impact.effect==='shortened'/)
})

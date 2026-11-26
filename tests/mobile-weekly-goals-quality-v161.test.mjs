import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {qualityIntent,savedQualityIntent,plannedSupplementDays} from '../src/lib/trainingIntent.mjs'
import {buildWeeklyBudget} from '../src/lib/weeklyTraining.mjs'
const today='2026-11-26',start='2026-11-23',end='2026-11-29'
const rest={date:today,kind:'recovery',sport:'running',approvable:false,title:'Regeneration',rhythm:[{kind:'rowing',status:'paused',minutes:30}]}
const track={date:'2026-11-28',kind:'option',title:'ORC Track (optional)',sport:'running',intensityIntent:'hard-option',approvable:false}
const board={start,activities:[],manual:[]}
test('paused recurring preferences do not appear as planned weekly goals',()=>{
 const b=buildWeeklyBudget({today,start,days:[rest,{...rest,date:'2026-11-27',rhythm:[{kind:'strength',status:'paused'}]}],boards:[board],protectedPhase:true,rhythm:{rowing:{days:[4],minutes:30},strength:{days:[2,5],minutes:30}}})
 assert.equal(b.rowingTarget,null);assert.equal(b.strengthTarget,null)
 assert.equal(b.rowingDays,0);assert.equal(b.strengthDays,0);assert.equal(b.qualityPlanned,0);assert.equal(b.qualityCandidates,0)
})
test('planned supplement days count saved records and open suggestions once, not wishes or declined days',()=>{
 const p=plannedSupplementDays({start,end,today,days:[
 {...rest,kind:'rowing',sport:'other',approvable:true},
 {...rest,date:'2026-11-27',kind:'mobility',sport:'strength',approvable:true},
 {...rest,date:'2026-11-28',kind:'mobility',sport:'strength',decision:'declined'},
 {...rest,date:'2026-11-29',kind:'rowing',sport:'other',approvable:true}
 ],plans:[{training_date:today,sport:'other',title:'Rudern · 30 Min.',state:'confirmed'},{training_date:today,sport:'other',title:'Rudern · 30 Min.',state:'draft'},{training_date:'2026-11-29',sport:'strength',title:'Stabi',state:'cancelled'}],occupied:new Set(['2026-11-29'])})
 assert.deepEqual(p,{rowingTarget:1,strengthTarget:1})
})
test('actual unscheduled cross training remains in actuals but does not create a target',()=>{
 const b=buildWeeklyBudget({today,start,boards:[{...board,activities:[{activity_id:'r',start_time_local:'2026-11-25T09:00:00',sport_type:'indoor_rowing',distance_m:5000,duration_s:1800}],manual:[{session_date:'2026-11-24',kind:'strength',duration_minutes:20}]}]})
 assert.equal(b.rowingDays,1);assert.equal(b.strengthDays,1)
 assert.equal(b.rowingTarget,null);assert.equal(b.strengthTarget,null)
})
test('quality requires planned intensity or a conditional polarized track slot, never just name or RPE',()=>{
 assert.equal(qualityIntent(track),'candidate')
 assert.equal(qualityIntent({...track,intensityIntent:'low-option'}),null)
 assert.equal(qualityIntent(track,{protectedPhase:true}),null)
 assert.equal(qualityIntent({...track,decision:'declined'}),null)
 assert.equal(qualityIntent({...track,kind:'chosen',selectedGroup:{title:'ORC Track',advice:'skip'}},{qualityDay:track.date}),null)
 assert.equal(qualityIntent({...track,kind:'chosen',selectedGroup:{title:'ORC Track',advice:'review'}},{qualityDay:track.date}),'candidate')
 assert.equal(qualityIntent({...track,kind:'long',rpe:9}),null)
 assert.equal(qualityIntent({...track,kind:'intervals',intensityIntent:'quality'}),'planned')
 assert.equal(savedQualityIntent({state:'confirmed',title:'Intervalle'}),null)
 assert.equal(savedQualityIntent({state:'confirmed',archive_snapshot:{sourceKind:'coach',coachKind:'easy'}}),null)
 assert.equal(savedQualityIntent({state:'confirmed',archive_snapshot:{sourceKind:'coach',coachKind:'intervals'}}),'planned')
})
test('weekly quality distinguishes candidates, confirmed intent and existing allowance',()=>{
 const b=buildWeeklyBudget({today,start,days:[{...track,qualityIntent:'candidate'}],boards:[board],plans:[{training_date:'2026-11-27',state:'confirmed',sport:'running',archive_snapshot:{sourceKind:'coach',coachKind:'tempo'}}],roadmap:[{start,targetKm:{low:30,high:40},qualityOptions:1}]})
 assert.equal(b.qualityPlanned,1);assert.equal(b.qualityCandidates,1);assert.equal(b.qualityOptions,1)
})
test('same explicit intent drives calendar and Coach; no progress bar without a mileage goal',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 for(const path of ['src/pages/CalendarPage.tsx','src/components/CoachDecisionLive.tsx','src/components/CalendarWeekBoard.tsx','src/components/CoachSevenDay.tsx'])assert.match(read(path),/<TrainingQualityMark/)
 assert.match(read('src/components/WeeklyTrainingCard.tsx'),/b\.target&&b\.actualKm!==null/)
 assert.match(read('src/components/WeeklyTrainingCard.tsx'),/b\.strengthTarget!==null\|\|\(b\.strengthDays\?\?0\)>0/)
 assert.match(read('src/components/WeeklyTrainingCard.tsx'),/b\.rowingTarget!==null\|\|\(b\.rowingDays\?\?0\)>0/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {allocateWeeklyRunning,buildWeeklyBudget} from '../src/lib/weeklyTraining.mjs'
import {protectQualitySlots,qualityIntent} from '../src/lib/trainingIntent.mjs'
const today='2026-11-23',start=today
const run=(id,date,km)=>({activity_id:id,start_time_local:date+'T09:00',sport_type:'running',distance_m:km*1000,duration_s:km*360,rpe_raw:30})
const boards=[{start,activities:[],manual:[]},{start:'2026-11-16',activities:[run(1,'2026-11-16',6),run(2,'2026-11-18',8),run(3,'2026-11-21',10)],manual:[]}]
const easy=(date,minutes=40)=>({date,kind:'easy',sport:'running',title:'Locker',reason:'Locker',minutes,approvable:true,intensityIntent:'low'})
const rest=date=>({date,kind:'recovery',sport:'running',title:'Ruhe',approvable:false,minutes:null})
const days=[easy(today),rest('2026-11-24'),easy('2026-11-25'),rest('2026-11-26'),easy('2026-11-27'),rest('2026-11-28'),{...easy('2026-11-29',75),kind:'long'}]
const budget=(low,high,longRunMinutes=75,t= today,extra={})=>(d,date)=>buildWeeklyBudget({today:t,start,boards,days:d,roadmap:[{start,phase:'build',targetKm:{low,high},longRunMinutes,qualityOptions:1}],...extra})
test('weekly allocation reduces open durations only, respects long-run ceiling, and keeps inputs immutable',()=>{
 const before=JSON.stringify(days)
 const b=budget(25,30,60),r=allocateWeeklyRunning(days,b,{today})
 assert.equal(r.days[6].minutes,60)
 assert.ok(r.changes.length>=1)
 assert.ok(b(r.days,start).forecastKm<b(days,start).forecastKm)
 assert.equal(JSON.stringify(days),before)
 assert.equal(r.days[1],days[1])
 assert.ok(r.days.filter(d=>d.kind==='easy').every(d=>d.minutes>=20))
})
test('one conservative progression allowance at beginning of week only with complete evidence',()=>{
 const b=budget(40,45),r=allocateWeeklyRunning(days,b,{today,volumeStatus:'progress'})
 assert.equal(r.changes.length,1);assert.equal(r.changes[0].to-r.changes[0].from,5)
 for(const ctx of [{protectedPhase:true},{alreadyAdjusted:true},{volumeStatus:'maintain'},{today:'2026-11-27'}])assert.equal(allocateWeeklyRunning(days,b,{today,volumeStatus:'progress',...ctx}).changes.length,0)
 assert.equal(allocateWeeklyRunning(days.slice(0,-1),b,{today,volumeStatus:'progress'}).changes.length,0)
})
test('approved, selected, declined and missing-evidence days cannot be extended',()=>{
 const d=days.map(x=>x.kind==='easy'?{...x,decision:'accepted'}:x)
 assert.equal(allocateWeeklyRunning(d,budget(40,45),{today,volumeStatus:'progress'}).changes.length,0)
 assert.equal(allocateWeeklyRunning(days,budget(40,45,75,today,{boards:boards.slice(0,1)}),{today,volumeStatus:'progress'}).changes.length,0)
})
test('saved quality draft reserves ISO-week slot; a conditional ORC choice stays low instead',()=>{
 const track={date:'2026-11-28',kind:'option',title:'ORC Track',intensityIntent:'hard-option'}
 const confirmed={state:'confirmed',training_date:'2026-11-24',archive_snapshot:{sourceKind:'coach',coachKind:'intervals'}}
 for(const state of ['draft','pending','confirmed']){
  const r=protectQualitySlots([track],[{...confirmed,state}],[],{today,qualityDay:track.date})[0]
  assert.equal(r.qualitySlotBlocked,true);assert.equal(qualityIntent(r),null);assert.match(r.reason,/Keine zweite/)
 }
 assert.equal(protectQualitySlots([track],[{...confirmed,state:'cancelled'}],[],{today})[0],track)
 assert.equal(protectQualitySlots([track],[{...confirmed,training_date:'2026-11-30'}],[],{today})[0],track)
 assert.equal(protectQualitySlots([track],[],[{start,qualityOptions:0}],{today})[0].qualitySlotBlocked,true)
 const chosen={...track,kind:'chosen',selectedGroup:{title:'ORC Track',advice:'review'}}
 const out=protectQualitySlots([chosen],[confirmed],[],{today,qualityDay:track.date})[0]
 assert.equal(out.selectedGroup.advice,'easy')
 assert.equal(chosen.selectedGroup.advice,'review')
})

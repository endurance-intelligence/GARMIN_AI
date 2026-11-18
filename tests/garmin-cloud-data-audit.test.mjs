import test from 'node:test'
import assert from 'node:assert/strict'
import {buildCloudPreview} from '../scripts/cloud/garmin-cloud-data-audit-model.mjs'

const one='0123456789abcdef0123456789abcdef'
const two='abcdef0123456789abcdef0123456789'
const gear=[
  {uuid:one,displayName:'Blue / White',customMakeModel:'Altra FWD VIA',
    gearStatusName:'active',gearTypeName:'Shoes'},
  {uuid:two,displayName:'Black',customMakeModel:'Altra FWD VIA',
    gearStatusName:'retired',gearTypeName:'Shoes'}
]
const calendar=[{scheduleDate:'2026-11-10',scheduledWorkoutId:999,workoutName:'Locker'}]
const lists=[[{activityId:24725092836}],[{activityId:24725092837}]]
const baseline={
  gear:gear.map(g=>({id:g.uuid,name:g.displayName,status:g.gearStatusName})),
  activity_gear:[{gearId:one,activityId:'24725092837'},{gearId:two,activityId:'24725092836'}],
  schedule:[{date:'2026-11-10',id:'999',workoutId:null,name:'Locker',sport:null,restDay:false}]
}
test('complete history detects shoe swap even when total link count stays the same',()=>{
 const result=buildCloudPreview({rawGear:gear,rawCalendar:calendar,activityLists:lists,baseline})
 assert.equal(result.complete,true)
 assert.equal(result.totals.gear,2)
 assert.equal(result.totals.links,2)
 assert.equal(result.differences.linksAdded,2)
 assert.equal(result.differences.linksRemoved,2)
 assert.equal(result.differences.calendarAdded,0)
})
test('incomplete Garmin history is never treated as authoritative',()=>{
 assert.throws(()=>buildCloudPreview({rawGear:gear,rawCalendar:calendar,activityLists:[lists[0]],baseline}),/Partial/)
})
test('full upstream page is treated as potentially truncated',()=>{
 const full=Array.from({length:1000},(_,i)=>({activityId:10000000000+i}))
 assert.throws(()=>buildCloudPreview({rawGear:gear,rawCalendar:calendar,activityLists:[full,lists[1]],baseline}),/truncated/)
})
test('retired gear must be checked and cannot disappear silently',()=>{
 assert.throws(()=>buildCloudPreview({
   rawGear:[gear[0]],rawCalendar:calendar,activityLists:[lists[0]],baseline
 }),/missing previously known gear/)
})
test('unrecognized status or calendar fields do not create fake data',()=>{
 assert.throws(()=>buildCloudPreview({
   rawGear:gear.map(x=>({...x,gearStatusName:'new-status'})),
   rawCalendar:calendar,activityLists:lists,baseline
 }),/unrecognized/)
 assert.throws(()=>buildCloudPreview({
   rawGear:gear,rawCalendar:[{unexpected:'x'}],activityLists:lists,baseline
 }),/unrecognized/)
})
test('calendar diff captures new/removed workouts without Garmin writes',()=>{
 const result=buildCloudPreview({rawGear:gear,
   rawCalendar:[{scheduleDate:'2026-11-11',scheduledWorkoutId:1000,workoutName:'Intervalle'}],
   activityLists:lists,baseline})
 assert.equal(result.differences.calendarAdded,1)
 assert.equal(result.differences.calendarRemoved,1)
})

test('calendar changes outside selected read window are not falsely flagged as deletions',()=>{
 const modified={...baseline,schedule:[
  ...baseline.schedule,{date:'2026-10-01',id:'past',name:'Past workout'}
 ]}
 const result=buildCloudPreview({
   rawGear:gear,rawCalendar:calendar,activityLists:lists,baseline:modified,
   windowStart:'2026-11-01',windowEnd:'2026-11-30'
 })
 assert.equal(result.differences.calendarRemoved,0)
})

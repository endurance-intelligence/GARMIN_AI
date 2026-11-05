import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalGearId,startGearScan,resumeGearScan,saveGearScanResult,
  finishGearScan,compareLinkSets,
} from '../scripts/garmin-gear-sync-model.mjs'
import {sanitizedGearLinkReport} from '../server/garminConnectLocal.ts'

const a='0123456789abcdef0123456789abcdef'
const b='abcdef0123456789abcdef0123456789'
const gear=[{id:a},{id:b}]
const old=[{activityId:'24725092836',gearId:a},{activityId:'24725092837',gearId:a}]
const current=[{activityId:'24725092836',gearId:b},{activityId:'24725092837',gearId:a}]
const source=()=>({
  source:'Garmin Connect (unofficial)',readOnly:true,
  gear:{status:'ok',items:gear.map(g=>({...g,status:'active',type:'Shoes'}))}
})

test('gear identity is canonicalized without storing raw Garmin details',()=>{
 assert.equal(canonicalGearId(a.toUpperCase()),a)
 assert.equal(canonicalGearId('not-a-uuid'),null)
})
test('partial run cannot be mistaken for a full scan',()=>{
 let state=startGearScan(gear)
 state=saveGearScanResult(state,a,[{activityId:24725092837}])
 assert.throws(()=>finishGearScan(state),/incomplete/)
})
test('a completed local checkpoint is resumed without repeating the first gear',()=>{
 let state=startGearScan(gear,'2026-11-05T10:00:00.000Z')
 state=saveGearScanResult(state,a,[{activityId:24725092837}])
 const resumed=resumeGearScan(JSON.parse(JSON.stringify(state)),gear,Date.parse('2026-11-05T12:00:00.000Z'))
 assert.equal(Object.keys(resumed.completed).length,1)
 const finished=saveGearScanResult(resumed,b,[{activityId:24725092836}])
 assert.deepEqual(finishGearScan(finished),current.slice().reverse())
})
test('an old checkpoint is never mixed with newly changed Garmin activity assignments',()=>{
 let state=startGearScan(gear,'2026-11-01T10:00:00.000Z')
 state=saveGearScanResult(state,a,[{activityId:24725092836}])
 assert.throws(()=>resumeGearScan(state,gear,Date.parse('2026-11-05T12:00:00.000Z')),/Stale/)
})
test('moving a run from one shoe to another removes and adds associations',()=>{
 assert.deepEqual(compareLinkSets(old,current),{added:1,removed:1})
})
test('removing an old shoe association reduces history without inventing a replacement',()=>{
 const onlyOne=[{activityId:'24725092837',gearId:a}]
 assert.deepEqual(compareLinkSets(old,onlyOne),{added:0,removed:1})
})
test('a full page is treated as potentially truncated, not as final truth',()=>{
 const state=startGearScan(gear)
 const fullPage=Array.from({length:1000},(_,i)=>({activityId:10000000000+i}))
 assert.throws(()=>saveGearScanResult(state,a,fullPage),/truncated/)
})
test('sync local bridge requires all known gear and strips private fields',()=>{
 const report={
   source:'Garmin Connect (unofficial)',readOnly:true,scope:'complete',
   checkedAt:new Date().toISOString(),gearChecked:2,gearIds:[a,b],
   activityGearLinks:[{activityId:'24725092836',gearId:b,oauth:'SECRET'}],
   credentials:'SECRET'
 }
 const result=sanitizedGearLinkReport(report,source())
 assert.equal(result.mode,'gear-links')
 assert.deepEqual(result.activityGear,[{activityId:'24725092836',gearId:b}])
 assert.doesNotMatch(JSON.stringify(result),/SECRET|credentials|oauth/)
})
test('mismatched catalog prevents replacing stored links',()=>{
 const report={source:'Garmin Connect (unofficial)',readOnly:true,scope:'complete',
  checkedAt:new Date().toISOString(),gearChecked:1,gearIds:[a],
  activityGearLinks:[{activityId:'24725092836',gearId:a}]}
 assert.throws(()=>sanitizedGearLinkReport(report,source()),/mismatched-gear/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {classifySync,classifyFit} from '../supabase/functions/_shared/sync-health.mjs'

const now=Date.parse('2026-11-06T18:00:00Z')
const date=(h)=>new Date(now-h*3600_000).toISOString()
test('no evidence is unknown, never falsely healthy',()=>{
 assert.equal(classifySync({now}).state,'unknown')
 assert.equal(classifySync({lastAttemptAt:date(.1),lastResult:'success',now}).state,'unknown')
})
test('recent confirmed sync is current',()=>{
 const r=classifySync({lastAttemptAt:date(0.1),lastSuccessAt:date(0.1),lastResult:'success',thresholdHours:3,now})
 assert.equal(r.state,'ok')
 assert.equal(r.reason,'confirmed')
})
test('old successful sync is stale',()=>{
 const r=classifySync({lastAttemptAt:date(5),lastSuccessAt:date(5),lastResult:'success',thresholdHours:3,now})
 assert.equal(r.state,'stale')
})
test('recent failure takes precedence over older success',()=>{
 const r=classifySync({lastAttemptAt:date(.2),lastSuccessAt:date(1),lastResult:'error',thresholdHours:3,now})
 assert.equal(r.state,'failed')
 assert.equal(r.reason,'last-run-failed')
})
test('future timestamps cannot certify a successful import',()=>{
 const future=new Date(now+86400_000).toISOString()
 assert.equal(classifySync({lastAttemptAt:future,lastSuccessAt:future,lastResult:'success',now}).state,'unknown')
})
test('manual Garmin Connect imports are not shown as automatic healthy sources',()=>{
 assert.equal(classifySync({manual:true,lastAttemptAt:date(.01),lastSuccessAt:date(.01),now}).state,'manual')
})
test('FIT backlog status is based on actual queue counts',()=>{
 assert.deepEqual(classifyFit({queued:606,retry:0,processing:1}),{state:'processing',pending:607})
 assert.deepEqual(classifyFit({queued:0,retry:2,processing:0}),{state:'attention',pending:2})
 assert.deepEqual(classifyFit({queued:0,retry:0,processing:0}),{state:'idle',pending:0})
 assert.equal(classifyFit({queued:-1}).state,'unknown')
})

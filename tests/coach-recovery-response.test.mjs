import test from 'node:test'
import assert from 'node:assert/strict'
import {coachRecoveryResponse} from '../src/lib/coachRecoveryResponse.mjs'
const today='2026-11-28',d=i=>new Date(Date.parse(today+'T12:00:00Z')-i*86400000).toISOString().slice(0,10)
const mk=()=>{
 const boards=[5,12,19,26,33].map(i=>({start:d(i),activities:[],manual:[]}))
 const metrics=Array.from({length:29},(_,i)=>({metric_date:d(i),hrv_ms:50,resting_heart_rate:45}))
 for(const [i,rpe] of [[4,30],[11,30],[18,30],[6,80],[13,80],[20,80]]){
  const b=boards.find(b=>b.start<=d(i)&&d(i)<=new Date(Date.parse(b.start+'T12:00:00Z')+6*86400000).toISOString().slice(0,10))
  b.activities.push({activity_id:String(i),start_time_local:d(i)+' 16:00:00',sport_type:'running',duration_s:2400,rpe_raw:rpe})
  metrics[i-1].hrv_ms=rpe===80?40:52;metrics[i-1].resting_heart_rate=rpe===80?50:44
 }
 return {today,boards,health:{metrics,training:{historyStatus:'complete',truncated:false}}}
}
test('compare paired next-day values by actual RPE across several weeks',()=>{
 const r=coachRecoveryResponse(mk())
 assert.deepEqual(r.low,{count:3,weeks:3,hrvDelta:2,pulseDelta:-1})
 assert.deepEqual(r.high,{count:3,weeks:3,hrvDelta:-10,pulseDelta:5})
})
test('do not learn from partial syncs, mixed sessions, missing dates or unrecorded RPE',()=>{
 const a=mk();a.health.training.historyStatus='unknown';assert.equal(coachRecoveryResponse(a),null)
 const b=mk();const row=b.boards.flatMap(x=>x.activities).find(x=>x.rpe_raw===80);b.boards.find(x=>x.activities.includes(row)).activities.push({...row,activity_id:'other',sport_type:'cycling'});assert.equal(coachRecoveryResponse(b),null)
 const c=mk();c.health.metrics=c.health.metrics.filter(x=>x.metric_date!==d(4));assert.equal(coachRecoveryResponse(c),null)
 const e=mk();e.boards.flatMap(x=>x.activities).find(x=>x.rpe_raw===80).rpe_raw=null;assert.equal(coachRecoveryResponse(e),null)
})

test('manual activity on another day does not invalidate the whole ISO week',()=>{
 const x=mk();x.boards[0].manual.push({session_date:d(2),kind:'rowing'})
 assert.ok(coachRecoveryResponse(x))
 x.boards[0].manual.push({session_date:d(4),kind:'rowing'})
 assert.equal(coachRecoveryResponse(x),null)
})

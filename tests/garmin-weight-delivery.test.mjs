import test from 'node:test'
import assert from 'node:assert/strict'
import {deliverOneWeight} from '../scripts/cloud/garmin-weight-delivery.mjs'

const date='2026-11-09',kg=77.5,revision='2026-11-09T12:00:00.123Z'
const reading={calendarDate:date,weight:77500,samplePk:44}
const day=items=>({dateWeightList:items})
const make=({before=day([]),after=day([reading]),
    saved=true,writeError=null,readError=null,
    confirmSaved=true}={})=>{
  const calls=[]
  let reads=0
  const db={
    async nextPending(){calls.push('next');return{available:true,date,kg,revision}},
    async claim(d,w,v){calls.push('claim');assert.deepEqual([d,w,v],[date,kg,revision]);return{claimed:true,attemptId:'a1'}},
    async confirmExisting(d,w,v){calls.push('confirm-existing');assert.deepEqual([d,w,v],[date,kg,revision]);return{saved:confirmSaved}},
    async finish(d,id,status,code){calls.push('finish:'+status+':'+code);assert.equal(id,'a1');return{saved}}
  }
  const garmin={
    async getDailyWeighIns(d){calls.push('read');assert.equal(d,date);if(readError)throw readError;return reads++===0?before:after},
    async addWeighIn(value,unit,instant){
      calls.push('write');assert.equal(value,77.5);assert.equal(unit,'kg')
      assert.equal(instant.toISOString(),'2026-11-09T12:00:00.000Z')
      if(writeError)throw writeError
    }
  }
  return {db,garmin,calls}
}

test('disabled by default: remote is read for preview but no DB or Garmin writes',async()=>{
  const x=make()
  const res=await deliverOneWeight(x)
  assert.deepEqual(res,{state:'preview',code:'safe_to_write'})
  assert.deepEqual(x.calls,['next','read'])
})

test('read-first: identical existing weight is safely reconciled without another Garmin entry',async()=>{
  const x=make({before:day([reading])})
  const res=await deliverOneWeight({...x,writesEnabled:true})
  assert.deepEqual(res,{state:'confirmed',code:'matching_remote_weight'})
  assert.deepEqual(x.calls,['next','read','confirm-existing'])
})

test('one opt-in write is claimed, read back and only then confirmed',async()=>{
  const x=make()
  const res=await deliverOneWeight({...x,writesEnabled:true})
  assert.deepEqual(res,{state:'confirmed',code:'verified_read_back'})
  assert.deepEqual(x.calls,['next','read','claim','write','read','finish:confirmed:verified_read_back'])
})

test('2xx without read-back cannot mark weight confirmed, no retry',async()=>{
  const x=make({after:day([])})
  const res=await deliverOneWeight({...x,writesEnabled:true})
  assert.deepEqual(res,{state:'needs_review',code:'write_not_visible'})
  assert.equal(x.calls.filter(x=>x==='write').length,1)
})

test('Garmin 429 before write never claims or sends; in-write 429 is needs_review',async()=>{
  const rateLimit=Object.assign(new Error('secret Garmin token should not be logged'),{
    name:'GarminRateLimitError'
  })
  const x=make({readError:rateLimit})
  const res=await deliverOneWeight({...x,writesEnabled:true})
  assert.deepEqual(res,{state:'blocked',code:'rate_limited'})
  assert.deepEqual(x.calls,['next','read'])

  const y=make({writeError:rateLimit})
  const after=await deliverOneWeight({...y,writesEnabled:true})
  assert.deepEqual(after,{state:'needs_review',code:'rate_limited'})
  assert.equal(y.calls.filter(x=>x==='write').length,1)
  assert.ok(y.calls.includes('finish:needs_review:rate_limited'))
})

test('different Garmin weight or multiple entries never overwritten',async()=>{
  for(const before of [day([{...reading,weight:80000}]),day([reading,reading]),null]){
    const x=make({before})
    const res=await deliverOneWeight({...x,writesEnabled:true})
    assert.equal(res.state,'needs_review')
    assert.deepEqual(x.calls,['next','read'])
  }
})

test('failed or concurrent DB claim never reaches Garmin write',async()=>{
  const x=make()
  x.db.claim=async()=>({claimed:false})
  const res=await deliverOneWeight({...x,writesEnabled:true})
  assert.deepEqual(res,{state:'blocked',code:'concurrent_change'})
  assert.equal(x.calls.includes('write'),false)
})

test('failed confirmation never invents a successful status',async()=>{
  const x=make({saved:false})
  const res=await deliverOneWeight({...x,writesEnabled:true})
  assert.deepEqual(res,{state:'blocked',code:'outbox_finish_failed'})
})

test('unknown errors never stringify sensitive Garmin SDK exceptions',async()=>{
  const x=make({writeError:new Error('Authorization: Bearer very_secret')})
  const res=await deliverOneWeight({...x,writesEnabled:true})
  assert.deepEqual(res,{state:'needs_review',code:'write_error'})
  assert.doesNotMatch(JSON.stringify(res),/very_secret/)
})

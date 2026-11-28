import test from 'node:test'
import assert from 'node:assert/strict'
import {healthCoachContext} from '../src/lib/healthCoachContext.mjs'
const today='2026-11-28',day=i=>new Date(Date.parse(today+'T12:00:00Z')-i*86400000).toISOString().slice(0,10)
const weights=Array.from({length:28},(_,i)=>({weigh_date:day(i),weight_kg:i<14?75:77}))
const health=Array.from({length:28},(_,i)=>({metric_date:day(i),hrv_ms:i<14?40:55,resting_heart_rate:i<14?55:49,sleep_seconds:27000}))
test('weight plus multiple independently measured recovery changes creates descriptive context only',()=>{
 const r=healthCoachContext({today,weights,health,adultConfirmed:true})
 assert.equal(r.weightChange,-2);assert.equal(r.signals.length,2);assert.match(r.text,/keine nachgewiesene Ursache/)
})
test('weight only, sparse or stale data, or no adult opt-in do not produce alerts',()=>{
 const base={today,weights,health,adultConfirmed:true}
 for(const update of [{health:[]},{weights:weights.slice(0,5)},{adultConfirmed:false},{health:health.map(r=>({...r,resting_heart_rate:49}))},{weights:weights.filter((_,i)=>i>3)}])assert.equal(healthCoachContext({...base,...update}),null)
})

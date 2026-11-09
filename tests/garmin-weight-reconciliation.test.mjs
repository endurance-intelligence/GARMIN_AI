import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  validWeightOutboxEntry,assessGarminWeightDay,
  verifyGarminWeightWrite,weightWriteInstant
} from '../scripts/cloud/garmin-weight-reconciliation.mjs'

const entry={date:'2026-11-09',kg:77.5}
const day=(list)=>({dateWeightList:list})
const reading=(date='2026-11-09',grams=77500)=>({
  samplePk:123,calendarDate:date,weight:grams
})
const sql=readFileSync(
  new URL('../supabase/migrations/20261109131857_garmin_weight_delivery_safety_v090.sql',import.meta.url),
  'utf8'
)

test('reject missing, malformed or unsafe kg/date before any network action',()=>{
  for(const bad of [
    null,{}, {weigh_date:'2026-02-30',weight_kg:77.5},
    {weigh_date:'2026-11-09',weight_kg:77500},
    {weigh_date:'2026-11-09',weight_kg:25},
    {weigh_date:'2026-11-09',weight_kg:77.55},
    {weigh_date:'2026-11-09',weight_kg:'NaN'},
    {weigh_date:'2026-11-09',weight_kg:Infinity}
  ])assert.equal(validWeightOutboxEntry(bad),null)
  assert.deepEqual(validWeightOutboxEntry({
    weigh_date:entry.date,weight_kg:'77.5'
  }),{date:entry.date,kg:77.5})
})

test('empty Garmin day is the only case safe for a first write',()=>{
  assert.deepEqual(assessGarminWeightDay(entry,day([])),{
    status:'safe_to_write',code:'empty_day_verified'
  })
  assert.deepEqual(assessGarminWeightDay(entry,null),{
    status:'needs_review',code:'invalid_garmin_day'
  })
  assert.deepEqual(assessGarminWeightDay(entry,{}),{
    status:'needs_review',code:'invalid_garmin_day'
  })
})

test('read side returns grams: 77,500 g equals a 77.5kg manual entry',()=>{
  assert.deepEqual(assessGarminWeightDay(entry,day([reading()])),{
    status:'already_present',code:'matching_remote_weight'
  })
  assert.deepEqual(assessGarminWeightDay(entry,day([reading(entry.date,78500)])),{
    status:'needs_review',code:'different_remote_weight'
  })
})

test('ambiguous Garmin day or wrong date MUST NOT be overwritten',()=>{
  for(const list of [
    [reading(),reading()],
    [reading('2026-11-08')],
    [{calendarDate:entry.date,weight:77500.1}],
    [{calendarDate:entry.date,weight:'77500'}],
    [{weight:77500}]
  ])assert.equal(assessGarminWeightDay(entry,day(list)).status,'needs_review')
})

test('post-write 2xx is not confirmation: only unique read-back can confirm',()=>{
  assert.deepEqual(verifyGarminWeightWrite(entry,day([reading()])),{
    status:'confirmed',code:'verified_read_back'
  })
  assert.deepEqual(verifyGarminWeightWrite(entry,day([])),{
    status:'needs_review',code:'write_not_visible'
  })
  assert.equal(verifyGarminWeightWrite(entry,null).status,'needs_review')
  assert.equal(verifyGarminWeightWrite(entry,day([reading(),reading()])).status,'needs_review')
})

test('selected date is retained instead of replacing it with the cloud run date',()=>{
  assert.equal(weightWriteInstant('2026-01-15').toISOString(),'2026-01-15T12:00:00.000Z')
  assert.equal(weightWriteInstant('2026-07-15').toISOString(),'2026-07-15T12:00:00.000Z')
  assert.equal(weightWriteInstant('garbage'),null)
})

test('private database outbox is atomic and NEVER auto-requeues uncertain writes',()=>{
  assert.match(sql,/add column if not exists attempt_id uuid/)
  assert.match(sql,/and attempt_id is null/)
  assert.match(sql,/and attempt_count=0/)
  assert.match(sql,/and updated_at=p_revision/)
  assert.match(sql,/and weight_kg=p_kg/)
  assert.match(sql,/set state='sending'/)
  assert.match(sql,/where weigh_date=p_date/)
  assert.match(sql,/p_status not in \('confirmed','needs_review'\)/)
  assert.doesNotMatch(sql,/set state='pending'/)
  assert.match(sql,/revoke all on function public\.garmin_weight_claim\(date,numeric,timestamptz\)/)
  assert.match(sql,/grant execute on function public\.garmin_weight_claim\(date,numeric,timestamptz\) to service_role/)
  assert.doesNotMatch(sql,/(select|insert|update|delete)\s+.*vault\.decrypted_secrets/i)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {validWeightEntry} from '../supabase/functions/_shared/weight-entry.mjs'

const now=Date.parse('2026-11-06T12:00:00.000Z')
test('accepts a valid mobile weigh-in in kilograms, date-only',()=>{
 assert.deepEqual(validWeightEntry({date:'2026-11-06',kg:77.5},now),{date:'2026-11-06',kg:77.5})
})
test('accepts two decimal places and backfill within 30 days',()=>{
 assert.deepEqual(validWeightEntry({date:'2026-10-28',kg:77.45},now),{date:'2026-10-28',kg:77.45})
})
test('rejects invalid units, impossible weights and fake dates',()=>{
 for(const input of [
  {date:'2026-11-06',kg:77500},
  {date:'2026-11-06',kg:'77,5'},
  {date:'2026-02-30',kg:77.5},
  {date:'2026-11-06',kg:77.555},
  {date:'2026-11-06',kg:NaN},
  {date:'2026-11-06',kg:-1},
  null
 ]) assert.equal(validWeightEntry(input,now),null)
})
test('rejects stale/future entries to reduce duplicate Garmin transfers',()=>{
 assert.equal(validWeightEntry({date:'2026-09-01',kg:77.5},now),null)
 assert.equal(validWeightEntry({date:'2026-11-09',kg:77.5},now),null)
})

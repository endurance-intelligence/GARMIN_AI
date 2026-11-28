import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {normalizeCycleObservation,trimCycleHistory,publicCycleState} from '../src/lib/cycleHistory.mjs'
const today='2026-11-28',valid={dayInCycle:7,startDate:'2026-11-22',predictedCycle:false,pregnancyCycle:false,currentPhase:3,notes:'synthetic'}
test('only date and coherent non-predicted cycle day survive normalization',()=>{
 assert.deepEqual(normalizeCycleObservation(valid,today),{date:today,dayInCycle:7})
 for(const v of [{...valid,predictedCycle:true},{...valid,predictedCycle:null},{...valid,pregnancyCycle:true},{...valid,pregnancyCycle:undefined},{...valid,dayInCycle:8},{...valid,startDate:'2026-02-30'}])assert.equal(normalizeCycleObservation(v,today),null)
})
test('retention, deduplication and disabled state never reveal saved observations',()=>{
 assert.deepEqual(trimCycleHistory([{date:'2026-01-01',dayInCycle:1},{date:today,dayInCycle:7,notes:'ignored'},{date:'2026-11-29',dayInCycle:8}],today),[{date:today,dayInCycle:7}])
 assert.deepEqual(publicCycleState({enabled:false,observations:[{date:today,dayInCycle:7}]},today),{enabled:false,status:'idle',lastAttempt:null,observations:[]})
})
test('automatic import is separately consented, daily-gated and guarded against revoked consent',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const sync=read('supabase/functions/_shared/cycle-history-sync.ts'),api=read('supabase/functions/garmin-athlete-profile/index.ts'),sql=read('supabase/migrations/20261128141701_garmin_cycle_history.sql')
 assert.match(sync,/row\?\.enabled!==true/)
 assert.match(sync,/last_attempt_on\.is\.null,last_attempt_on\.lt\./)
 assert.match(sync,/eq\('generation',claim.generation\)/)
 assert.match(sync,/getUserById/)
 assert.doesNotMatch(sync,/console\./)
 assert.match(api,/generation:crypto.randomUUID\(\),observations:\[\],last_attempt_on:null/)
 assert.match(api,/if\(!\(await readCycle\(\)\).enabled\)/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/from public, anon, authenticated/)
 assert.match(read('supabase/functions/sync-garmin-health/index.ts'),/await syncConsentedCycle/)
 assert.match(read('src/components/CycleHistoryCard.tsx'),/disabled=\{!accepted\|\|busy\}/)
})

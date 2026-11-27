import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {classifyFit} from '../supabase/functions/_shared/sync-health.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('missing source records are distinct from open imports and failures',()=>{
 assert.deepEqual(classifyFit({unavailable:8}),{state:'idle',pending:0})
 assert.deepEqual(classifyFit({unavailable:8,paused:1}),{state:'attention',pending:0})
 assert.deepEqual(classifyFit({unavailable:8,retry:1}),{state:'attention',pending:1})
 const s=read('src/components/SyncCenter.tsx')
 assert.match(s,/counts\?\.paused/)
 assert.match(s,/counts\?\.unavailable/)
 assert.match(s,/Detaildaten nicht verfügbar/)
})
test('terminal missing record migration keeps bounded retry, lease guard and service-only permissions',()=>{
 const s=read('supabase/migrations/20261127095946_fit_missing_record_terminal_status.sql')
 assert.match(s,/p_reason = 'fit-records-unavailable' AND fit_attempts >= 5/)
 assert.match(s,/WHEN fit_attempts >= 5 THEN 'paused' ELSE 'retry'/)
 assert.match(s,/AND fit_lease_token = p_lease_token/)
 assert.match(s,/FROM PUBLIC, anon, authenticated/)
 assert.match(s,/TO service_role/)
 assert.match(s,/NOT EXISTS \(SELECT 1 FROM public.garmin_fit_record_chunks/)
})

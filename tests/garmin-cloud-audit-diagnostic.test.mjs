import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAuditDiagnostic} from '../scripts/cloud/safe-audit-diagnostic.mjs'

test('safe GitHub OIDC failure status displays only phase and numeric status',()=>{
  assert.equal(
    safeAuditDiagnostic('supabase-vault-read',403),
    'GARMIN CLOUD DATA AUDIT: stopped at supabase-vault-read (HTTP 403). No Garmin or application data were changed.'
  )
})
test('unknown exception text or secrets never enter diagnostics',()=>{
  const secret='Bearer secret_PRIVATE_TOKEN'
  const result=safeAuditDiagnostic('garmin-profile '+secret,'500 '+secret)
  assert.equal(result.includes(secret),false)
  assert.equal(result.includes('unclassified'),true)
})
test('valid phases differentiate auth and upstream Garmin issues',()=>{
  for(const phase of ['github-oidc','load-garmin-session','garmin-profile',
    'garmin-gear','garmin-calendar','garmin-gear-history','compare-catalog','save-rotated-session']){
    assert.equal(safeAuditDiagnostic(phase).includes(phase),true)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {safeAuditDiagnostic,safeGarminFailureKind} from '../scripts/cloud/safe-audit-diagnostic.mjs'

test('safe GitHub OIDC status only prints numeric HTTP status',()=>{
  assert.equal(
    safeAuditDiagnostic('supabase-vault-read',403),
    'GARMIN CLOUD DATA AUDIT: stopped at supabase-vault-read [unknown] (HTTP 403). Gear, calendar and weight records were not changed.'
  )
})
test('unknown error messages and tokens cannot enter diagnostics',()=>{
  const secret='Bearer secret_PRIVATE_TOKEN'
  const output=safeAuditDiagnostic('garmin-profile '+secret,'500 '+secret,secret)
  assert.equal(output.includes(secret),false)
  assert.equal(output.includes('unclassified'),true)
})
test('OAuth renewal is separate from profile fetch and schema validation',()=>{
  for(const phase of ['github-oidc','load-garmin-session','garmin-oauth-refresh',
    'garmin-profile-request','garmin-profile-shape','garmin-gear','garmin-calendar',
    'garmin-gear-history','compare-catalog','save-rotated-session']) {
    assert.equal(safeAuditDiagnostic(phase).includes(phase),true)
  }
})
test('only trusted Garmin exception names and HTTP status are reported',()=>{
  const secret='token=do_not_print'
  const cases=[
    [{name:'GarminAuthError',message:secret},'auth-rejected',null],
    [{name:'GarminRateLimitError',message:secret},'rate-limited',429],
    [{name:'GarminConnectionError',message:secret},'network-or-timeout',null],
    [{name:'GarminHttpError',status:503,url:secret,body:secret},'http-error',503],
    [{name:'GarminHttpError',status:'503',body:secret},'http-error',null],
    [{name:'SyntaxError',message:secret},'invalid-json-response',null],
    [{name:secret,message:secret},'unknown',null]
  ]
  for(const [err,kind,status] of cases) {
    const classification=safeGarminFailureKind(err)
    assert.deepEqual(classification,{kind,status})
    const output=safeAuditDiagnostic('garmin-oauth-refresh',classification.status,classification.kind)
    assert.equal(output.includes(secret),false)
  }
})

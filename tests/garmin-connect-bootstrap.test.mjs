import test from 'node:test'
import assert from 'node:assert/strict'
import {isGarminCloudSession} from '../supabase/functions/_shared/garmin-connect-tokens.mjs'

function example() {
  return {oauth1:{oauth_token:'a'.repeat(24),oauth_token_secret:'b'.repeat(24),
                  domain:'garmin.com'},
          oauth2:{access_token:'c'.repeat(48),refresh_token:'d'.repeat(48),
                  expires_at:1793980000,refresh_token_expires_at:1803980000}}
}
test('valid garminconnect-js session envelope can be stored privately',()=>{
  assert.equal(isGarminCloudSession(example()),true)
})
test('must have both valid Garmin OAuth versions',()=>{
  const sample=example()
  for(const broken of [
    null,[],{},sample.oauth2,
    {...sample,oauth1:{...sample.oauth1,oauth_token:''}},
    {...sample,oauth2:{...sample.oauth2,refresh_token:undefined}},
    {...sample,oauth2:{...sample.oauth2,expires_at:null}},
    {...sample,oauth2:{...sample.oauth2,refresh_token_expires_at:'2026-11-06'}}
  ]) assert.equal(isGarminCloudSession(broken),false)
})
test('Garmin COM cannot accept a Garmin CN session',()=>{
  const sample=example()
  sample.oauth1.domain='garmin.cn'
  assert.equal(isGarminCloudSession(sample),false)
})
test('oversized credentials are rejected before Vault RPC',()=>{
  const sample=example()
  sample.oauth2.access_token='x'.repeat(8193)
  assert.equal(isGarminCloudSession(sample),false)
})
test('validation never mutates original tokens',()=>{
  const sample=example()
  const before=JSON.stringify(sample)
  assert.equal(isGarminCloudSession(sample),true)
  assert.equal(JSON.stringify(sample),before)
})

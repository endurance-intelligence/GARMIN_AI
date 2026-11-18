import test from 'node:test'
import assert from 'node:assert/strict'
import {isGarminCloudSession,tokenChanged} from '../scripts/cloud/garmin-cloud-session.mjs'
const original=()=>({
  oauth1:{oauth_token:'a'.repeat(20),oauth_token_secret:'b'.repeat(20),domain:'garmin.com'},
  oauth2:{access_token:'c'.repeat(20),refresh_token:'d'.repeat(20),
    expires_at:1793980000,refresh_token_expires_at:1803980000}
})
test('Vault supports the garminconnect-js OAuth1/OAuth2 session envelope',()=>{
 assert.equal(isGarminCloudSession(original()),true)
})
test('missing or malformed credentials fail closed',()=>{
 const b=original();delete b.oauth2.refresh_token
 assert.equal(isGarminCloudSession(b),false)
 for(const invalid of [null,{},[],{oauth1:{},oauth2:{}},'secrets']) {
   assert.equal(isGarminCloudSession(invalid),false)
 }
})
test('China / unexpected domain is never mixed into Garmin COM endpoints',()=>{
 const b=original();b.oauth1.domain='garmin.cn'
 assert.equal(isGarminCloudSession(b),false)
})
test('token rotation is detected without logging the tokens',()=>{
 const before=original(),after=original()
 assert.equal(tokenChanged(before,after),false)
 after.oauth2.access_token='new-token-'+ 'z'.repeat(20)
 assert.equal(tokenChanged(before,after),true)
})
test('corrupt token rotation cannot replace a valid Vault session',()=>{
 assert.throws(()=>tokenChanged(original(),{oauth1:{},oauth2:{}}),/Invalid Garmin session/)
})

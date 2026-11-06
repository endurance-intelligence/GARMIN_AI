import test from 'node:test'
import assert from 'node:assert/strict'
import {
 classifyGarminCloudCheck,accessTokenNotExpired
} from '../supabase/functions/_shared/garmin-cloud-check.mjs'

test('valid Garmin social profile response proves an actual live read',()=>{
 assert.equal(classifyGarminCloudCheck(200,{displayName:'private-id'}),'verified')
 assert.equal(classifyGarminCloudCheck(200,{profileId:123456}),'verified')
})
test('HTTP success with missing, HTML or malformed profile never confirms connection',()=>{
 for(const input of [null,{},[], 'HTML error page',{status:'ok'}]) {
  assert.equal(classifyGarminCloudCheck(200,input),'invalid_response')
 }
})
test('Garmin auth failures and rate limits are distinguishable without leaking details',()=>{
 assert.equal(classifyGarminCloudCheck(401,null),'auth_failed')
 assert.equal(classifyGarminCloudCheck(403,null),'auth_failed')
 assert.equal(classifyGarminCloudCheck(429,null),'rate_limited')
 assert.equal(classifyGarminCloudCheck(503,null),'unavailable')
 assert.equal(classifyGarminCloudCheck(302,null),'unavailable')
})
test('expired or nearly expired OAuth token is NOT sent to Garmin',()=>{
 const now=1793980000
 assert.equal(accessTokenNotExpired(now+90,now),true)
 assert.equal(accessTokenNotExpired(now+10,now),false)
 assert.equal(accessTokenNotExpired(now-90,now),false)
 assert.equal(accessTokenNotExpired(null,now),false)
 assert.equal(accessTokenNotExpired(now*1000,now),false)
})

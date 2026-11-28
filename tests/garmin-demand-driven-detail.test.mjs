import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {lazyGarminToken,garminRateLimited} from '../supabase/functions/_shared/garmin-demand-token.mjs'
test('idle detail jobs make zero token calls; active tasks share one promise',async()=>{
 let calls=0
 const get=lazyGarminToken(async()=>{calls++;return 'fixture'})
 assert.equal(calls,0)
 assert.deepEqual(await Promise.all([get(),get(),get()]),['fixture','fixture','fixture'])
 assert.equal(await get(),'fixture')
 assert.equal(calls,1)
})
test('failed token fetch is not repeated in the same invocation',async()=>{
 let calls=0
 const get=lazyGarminToken(async()=>{calls++;throw Object.assign(new Error('token HTTP 429'),{status:429})})
 await assert.rejects(get(),/HTTP 429/)
 await assert.rejects(get(),/HTTP 429/)
 assert.equal(calls,1)
 assert.equal(garminRateLimited({status:429}),true)
 assert.equal(garminRateLimited(new Error('FIT HTTP 429')),true)
 assert.equal(garminRateLimited(new Error('HTTP 503')),false)
})
test('all three worker paths acquire token only after work claim; 429 does not start later jobs',()=>{
 const code=readFileSync(new URL('../supabase/functions/backfill-garmin-details/index.ts',import.meta.url),'utf8')
 const main=code.slice(code.indexOf('const getToken = lazyGarminToken'))
 assert.ok(main.indexOf("admin.rpc('garmin_detail_claim')")<main.indexOf('await getToken()'))
 assert.match(main,/process\(id, string\(claim.sport_type\), await getToken\(\)\)/)
 assert.match(main,/downloadAndDecodeFit\(fitId, await getToken\(\)\)/)
 assert.match(main,/downloadAndDecodeFit\(routeId,await getToken\(\)\)/)
 assert.match(main,/safe.rateLimited \|\| garminRateLimited\(error\)\) return json/)
 assert.match(main,/if\(garminRateLimited\(error\)\)return json/)
})

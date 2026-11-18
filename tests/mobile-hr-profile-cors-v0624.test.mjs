import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {allowedHrProfileOrigin} from '../supabase/functions/sync-garmin-hr-profile/corsPolicy.mjs'
const source=readFileSync(new URL('../supabase/functions/sync-garmin-hr-profile/index.ts',import.meta.url),'utf8')

test('published GitHub Pages origin can call HR-zone GET and POST',()=>{
 assert.equal(allowedHrProfileOrigin('https://endurance-intelligence.github.io'),true)
 assert.match(source,/const allow = allowedHrProfileOrigin\(origin\)/)
 assert.match(source,/'Access-Control-Allow-Origin':origin!/)
 assert.match(source,/'Access-Control-Allow-Methods':'GET, POST, OPTIONS'/)
 assert.match(source,/req.method === 'OPTIONS'/)
})
test('local dev origins still work and all other origins are rejected',()=>{
 for(const url of ['http://localhost:5173','http://127.0.0.1:5179'])
  assert.equal(allowedHrProfileOrigin(url),true,url)
 for(const url of [null,'https://evil.example','https://endurance-intelligence.github.io.evil.example',
   'https://endurance-intelligence.github.io/other','http://endurance-intelligence.github.io',
   'https://github.com','http://localhost:3000','http://localhost:5172'])
  assert.equal(allowedHrProfileOrigin(url),false,String(url))
 assert.match(source,/origin_not_allowed/)
})
test('protected profile still verifies the user and the single authorized account',()=>{
 assert.match(source,/auth.auth.getUser\(bearer\[1\]\)/)
 assert.match(source,/user.email_confirmed_at/)
 assert.match(source,/user.email\?\.trim\(\)\.toLowerCase\(\) !== ownerEmail/)
 assert.match(source,/Cache-Control':'private, no-store'/)
 assert.match(source,/return json\(await latest\(\),200,headers\)/)
})

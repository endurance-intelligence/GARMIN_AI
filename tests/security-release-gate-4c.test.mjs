import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {isPublicConfig} from '../scripts/validate-public-config.mjs'
const url='https://eurgupsebxypjqvyizci.supabase.co'
const key=['sb','publishable','fixture'.repeat(4)].join('_')
test('production configuration is publishable-only and tied to the expected project',()=>{
 assert.equal(isPublicConfig(url,key),true)
 for(const k of [null,'',['sb','secret','fixture'.repeat(4)].join('_'),['legacy','jwt','fixture'].join('.'),' '+key,key+'\n'])assert.equal(isPublicConfig(url,k),false)
 assert.equal(isPublicConfig('https://fixture.example.invalid',key),false)
})
test('live access smoke is bounded read-only and never prints response payloads',()=>{
 const s=readFileSync(new URL('../scripts/security-live-read-smoke.mjs',import.meta.url),'utf8')
 assert.match(s,/method:'GET'/)
 assert.match(s,/redirect:'error'/)
 assert.match(s,/response\.body\?\.cancel\(\)/)
 assert.doesNotMatch(s,/response\.(json|text)\(/)
 assert.match(s,/Bearer not-a-valid-session/)
 assert.match(s,/\[401,403,404\]/)
 const w=readFileSync(new URL('../.github/workflows/garmin-ai-mobile-web.yml',import.meta.url),'utf8')
 assert.match(w,/node scripts\/validate-public-config\.mjs/)
 assert.ok(w.indexOf('node scripts/security-live-read-smoke.mjs')<w.indexOf('Upload verified static site'))
})

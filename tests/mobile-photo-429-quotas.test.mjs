import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const server=read('supabase/functions/garmin-workout-archive/index.ts')
const ui=read('src/components/WorkoutArchivePanel.tsx')
test('all documented OpenAI quota outcomes are explicitly recognized',()=>{
 for(const code of [
  'credit_balance_exhausted','organization_usage_limit_exceeded',
  'organization_spend_limit_exceeded','project_spend_limit_exceeded',
  'insufficient_quota'
 ])assert.ok(server.includes("'"+code+"'"),code)
 assert.match(server,/body\.error\.type/)
 assert.match(server,/providerType==='insufficient_quota'/)
 assert.match(server,/response\.status===429&&isQuota\?'vision_quota_exceeded'/)
})
test('unknown 429 must never be falsely identified as a temporary rate limit',()=>{
 assert.match(server,/providerType==='rate_limit_exceeded'/)
 assert.match(server,/response\.status===429&&isRateLimit\?'vision_rate_limited'/)
 assert.match(server,/response\.status===429\?'vision_429_unclear'/)
 assert.match(ui,/vision_429_unclear:'OpenAI meldet HTTP 429/)
 assert.match(ui,/nicht wiederholt versuchen/)
})
test('photo images, API secrets and unreviewed workouts remain private',()=>{
 assert.match(server,/console\.info\('GARMIN_AI photo parser outcome',code/)
 assert.doesNotMatch(server,/console\.log\(body\)|console\.log\(secret\)/)
 assert.match(server,/body\.reviewed!==true/)
 assert.match(server,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.doesNotMatch(server,/scheduleWorkout\(|uploadWorkout\(/)
})

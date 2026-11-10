import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const ui=read('src/components/WorkoutArchivePanel.tsx')
const service=read('supabase/functions/garmin-workout-archive/index.ts')

test('OpenAI response classes remain distinct from private archive availability',()=>{
 for(const code of [
  'vision_credentials_rejected','vision_quota_exceeded','vision_rate_limited','vision_429_unclear',
  'vision_model_unavailable','vision_request_rejected','vision_timeout',
  'vision_output_truncated','vision_incomplete','vision_invalid_output',
  'vision_upstream_unavailable','vision_needs_manual_review'
 ]){
  assert.ok(ui.includes(code),code)
  assert.ok(service.includes(code),code)
 }
 assert.match(ui,/OpenAI meldet fehlendes API-Guthaben/)
 assert.match(ui,/OpenAI hat den API-Key abgelehnt/)
 assert.match(ui,/Der OpenAI-Bildanalysedienst ist derzeit nicht erreichbar/)
 assert.match(ui,/Anfrage fehlgeschlagen \(HTTP '/)
})
test('provider failures are differentiated by HTTP and safely allowlisted codes',()=>{
 assert.match(service,/response\.status===401\|\|response\.status===403/)
 assert.match(service,/response\.status===429/)
 assert.match(service,/response\.status===404/)
 assert.match(service,/insufficient_quota/)
 assert.match(service,/billing_hard_limit_reached/)
 assert.match(service,/response\.status===400\|\|response\.status===422/)
 assert.match(service,/parsed\.code==='vision_rate_limited'\?429/)
 assert.match(service,/parsed\.code==='vision_timeout'\?504/)
})
test('never leak photo image, upstream error body or any API secret in diagnostics',()=>{
 assert.match(service,/Never return or log OpenAI's raw error body/)
 assert.match(service,/console\.info\('GARMIN_AI photo parser outcome',code/)
 assert.doesNotMatch(service,/console\.(log|error|warn|info)\([^\n]*secret/)
 assert.doesNotMatch(service,/console\.(log|error|warn|info)\([^\n]*image/)
 assert.match(service,/const secret=Deno\.env\.get\('OPENAI_API_KEY'\)/)
 assert.match(service,/const bearer=/)
 assert.match(service,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.match(service,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
})
test('photo parsing still cannot write unreviewed workouts or Garmin records',()=>{
 assert.match(service,/if\(body\.action==='parse_photo'\)/)
 assert.match(service,/body\.reviewed!==true/)
 assert.match(service,/if\(body\.action==='save'\)/)
 assert.doesNotMatch(service,/scheduleWorkout\(|uploadWorkout\(|addWeighIn\(/)
 assert.match(read('src/App.tsx'),/<OnlineAccessGate>/)
})

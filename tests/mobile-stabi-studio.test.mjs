import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const library=source('src/lib/eiExercises.ts')
const studio=source('src/pages/StrengthPage.tsx')
const client=source('src/lib/crossTrainingClient.ts')
const api=source('supabase/functions/garmin-cross-training/index.ts')
const coach=source('src/components/CrossTrainingCoachCard.tsx')
const app=source('src/App.tsx')
const more=source('src/pages/MorePage.tsx')
const migration=source('supabase/migrations/20261110180000_cross_training_studio_v0927.sql')

test('genuine Endurance Intelligence exercise guides are reused with no fake points',()=>{
 for(const id of ['dead-bug','bird-dog','pallof-press','forearm-plank','glute-bridge',
  'side-plank','calf-raise','knee-to-wall','hip-flexor-stretch','weighted-rdl']){
   assert.ok(library.includes('id: "'+id+'"'),id)
 }
 assert.match(studio,/detail\.steps/)
 assert.match(studio,/detail\.mistakes/)
 assert.match(studio,/detail\.easier/)
 assert.match(studio,/detail\.harder/)
 assert.match(studio,/detail\.cues/)
 assert.doesNotMatch(studio,/readinessScore|fakeScore|pseudoScore/)
})
test('studio contains single 40/20 interval player and no Garmin write',()=>{
 assert.match(studio,/phase:'work',remaining:40/)
 assert.match(studio,/phase:'rest',remaining:20/)
 assert.match(studio,/p\.round<3/)
 assert.match(studio,/Training starten/)
 assert.match(studio,/Mobility/)
 assert.match(studio,/Rudern/)
 assert.doesNotMatch(studio,/scheduleWorkout\(|garmin-cloud-worker|uploadWorkout\(/)
})
test('rowing and stabi are independently recorded only by actual button click',()=>{
 assert.match(studio,/async function save\(\)/)
 assert.match(studio,/onClick=\{\(\)=>void save\(\)\}/)
 assert.match(studio,/clientRequestId:requestId\.current/)
 assert.match(api,/p\.action!=='log'/)
 assert.match(api,/garminChanged:false,intervalsChanged:false/)
})
test('Garmin is source of truth and imported sport codes are recognized',()=>{
 for(const name of ['soccer','indoor_rowing','strength_training','mobility']){
  assert.ok(api.includes("'"+name+"'"))
 }
 assert.match(client,/type==='indoor_rowing'/)
 assert.match(client,/type==='strength_training'/)
 assert.match(client,/type==='mobility'/)
 assert.match(api,/duplicateGarmin:true/)
 assert.match(api,/confirmAdditional!==true/)
})
test('cross-training writes are owner-only and user approved',()=>{
 assert.match(api,/auth\.auth\.getUser/)
 assert.match(api,/user\.email_confirmed_at/)
 assert.match(api,/user\.email\?\.toLowerCase\(\)\.trim\(\)!==owner/)
 assert.match(migration,/enable row level security/)
 assert.match(migration,/revoke all .* public,anon,authenticated/)
 assert.match(migration,/grant select,insert .* to service_role/)
 assert.match(api,/requestId/)
})
test('Coach sees combined sports without turning them into running km',()=>{
 assert.match(coach,/loadCrossTraining\(/)
 assert.match(coach,/playedRecently/)
 assert.match(coach,/football\.length/)
 assert.match(coach,/rowing\.length/)
 assert.match(coach,/strength\.length/)
 assert.match(coach,/Keine 1:1-Umrechnung in Laufkilometer/)
})
test('iPhone navigation exposes movement studio via More and Coach',()=>{
 assert.match(app,/StrengthPage active=\{page==='strength'\}/)
 assert.match(more,/onGo\('strength'\)/)
 assert.match(source('src/pages/CoachPage.tsx'),/CrossTrainingCoachCard/)
 assert.match(studio,/<section className="ss-root page active"/)
 assert.match(source('src/styles/strength-studio.css'),/@media\(max-width:470px\)/)
})

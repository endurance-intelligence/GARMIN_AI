import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildMovementPlan,MOVEMENT_MINUTES,MOVEMENT_PATTERNS} from '../src/lib/movementSession.ts'
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const library=read('src/lib/eiExercises.ts')
const studio=read('src/pages/StrengthPage.tsx')
const coach=read('src/components/CrossTrainingCoachCard.tsx')
const client=read('src/lib/crossTrainingClient.ts')
const api=read('supabase/functions/garmin-cross-training/index.ts')
const app=read('src/App.tsx')
const more=read('src/pages/MorePage.tsx')
const migration=read('supabase/migrations/20261110180000_cross_training_studio_v0927.sql')

test('Endurance Intelligence guides plus missing push/pull are preserved',()=>{
 for(const id of ['dead-bug','bird-dog','pallof-press','forearm-plank',
 'glute-bridge','side-plank','calf-raise','knee-to-wall','hip-flexor-stretch',
 'weighted-rdl','band-row','overhead-press']){
  assert.ok(library.includes('id: "'+id+'"'),id)
 }
 for(const part of ['detail.steps','detail.mistakes','detail.easier','detail.harder','detail.cues'])
  assert.ok(studio.includes(part),part)
 assert.doesNotMatch(studio,/readinessScore|pseudoScore|fakeScore/)
})
test('workout is exactly thirty minutes, all movement patterns are covered',()=>{
 const p=buildMovementPlan('2026-11-11')
 assert.equal(MOVEMENT_MINUTES,30)
 assert.equal(p.steps.length,30)
 assert.equal(p.steps.reduce((sum,s)=>sum+s.workSeconds+s.restSeconds,0),1800)
 assert.equal(p.steps.filter(x=>x.part==='warmup').length,4)
 assert.equal(p.steps.filter(x=>x.part==='strength').length,24)
 assert.equal(p.steps.filter(x=>x.part==='cooldown').length,2)
 assert.equal(MOVEMENT_PATTERNS.length,8)
 for(const id of ['squat','hinge','single-leg','push','pull','core','calf','shoulder'])
  assert.ok(MOVEMENT_PATTERNS.some(x=>x.id===id),id)
 assert.ok(p.strengthIds.includes('band-row'))
 assert.ok(p.strengthIds.includes('push-up'))
 assert.ok(p.strengthIds.includes('overhead-press'))
})
test('balanced mixing is reproducible; variation stays inside a movement pattern',()=>{
 const a=buildMovementPlan('2026-11-11',0)
 const b=buildMovementPlan('2026-11-11',0)
 const changed=buildMovementPlan('2026-11-11',1)
 assert.deepEqual(a,b)
 assert.notDeepEqual(a.strengthIds,changed.strengthIds)
 for(const p of [a,changed])p.strengthIds.forEach((id,index)=>{
  assert.ok(MOVEMENT_PATTERNS[index].alternatives.includes(id),id)
 })
 assert.throws(()=>buildMovementPlan('tomorrow',0))
})
test('studio is one 40/20 player, no separate rowing or mobility studio',()=>{
 assert.match(studio,/buildMovementPlan\(date,rotation\)/)
 assert.match(studio,/40 Sekunden Arbeit \/ 20 Sekunden Wechsel/)
 assert.match(studio,/30-Minuten-Einheit starten/)
 assert.match(studio,/Neu zusammenstellen/)
 assert.match(studio,/kind:'strength'/)
 assert.doesNotMatch(studio,/topic==='rowing'|topic==='mobility'/)
 assert.doesNotMatch(studio,/scheduleWorkout\(|garmin-cloud-worker|uploadWorkout\(/)
})
test('real workouts are saved only by explicit user action with double-entry guard',()=>{
 assert.match(studio,/async function save\(\)/)
 assert.match(studio,/onClick=\{\(\)=>void save\(\)\}/)
 assert.match(studio,/clientRequestId:idempotency\.current/)
 assert.match(api,/p\.action!=='log'/)
 assert.match(api,/garminChanged:false,intervalsChanged:false/)
 assert.match(api,/duplicateGarmin:true/)
 assert.match(api,/confirmAdditional!==true/)
})
test('Garmin remains the cross-training source of truth',()=>{
 for(const name of ['soccer','indoor_rowing','strength_training','mobility'])
  assert.ok(api.includes("'"+name+"'"))
 assert.match(client,/type==='indoor_rowing'/)
 assert.match(client,/type==='strength_training'/)
 assert.match(client,/type==='mobility'/)
 assert.match(api,/auth\.auth\.getUser/)
 assert.match(api,/user\.email_confirmed_at/)
 assert.match(migration,/enable row level security/)
})
test('Coach considers rowing but does not feature it as separate training card',()=>{
 assert.match(coach,/loadCrossTraining\(/)
 assert.match(coach,/rowing\.length/)
 assert.match(coach,/playedRecently/)
 assert.match(coach,/ohne Laufkilometer-Umrechnung/)
 assert.doesNotMatch(coach,/<small>Rudern · 7 Tage<\/small>/)
})
test('iPhone navigation still exposes movement studio',()=>{
 assert.match(app,/StrengthPage active=\{page==='strength'\}/)
 assert.match(more,/onGo\('strength'\)/)
 assert.match(read('src/pages/CoachPage.tsx'),/CrossTrainingCoachCard/)
 assert.match(studio,/<section className="ss-root page active/)
 assert.match(read('src/styles/movement-studio-v2.css'),/@media\(max-width:490px\)/)
})

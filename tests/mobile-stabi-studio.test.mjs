import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildMovementPlan,MOVEMENT_MINUTES,MOVEMENT_PATTERNS,MOVEMENT_PREP_SECONDS,startMovementPlayer,tickMovementPlayer,advanceMovementPlayer,movementPlayerCue,movementSideSwitchMoment,movementPlayerPhase,movementFirstSideSeconds,movementSecondSideSeconds,movementRestSeconds} from '../src/lib/movementSession.ts'
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
 for(const id of ['dead-bug','bird-dog','forearm-plank',
 'glute-bridge','side-plank','calf-raise','knee-to-wall','hip-flexor-stretch',
 'reverse-snow-angel','prone-ytw','pike-push-up','single-leg-glute-bridge']){
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
 assert.ok(['reverse-snow-angel','prone-ytw'].includes(p.strengthIds[4]))
 assert.ok(p.strengthIds.includes('push-up'))
 assert.ok(p.strengthIds.includes('pike-push-up'))
 assert.doesNotMatch(p.strengthIds.join(','),/overhead-press|band-row|weighted-rdl|goblet-squat|pallof-press/)
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

test('five-second switches cover every adjacent exercise without extending the 30-minute plan',()=>{
 const p=buildMovementPlan('2026-11-16')
 assert.equal(MOVEMENT_PREP_SECONDS,5)
 assert.equal(p.steps.length,30)
 assert.equal(p.steps.reduce((s,x)=>s+x.workSeconds+x.restSeconds,0),1800)
 for(let i=0;i<p.steps.length-1;i++)assert.ok(p.steps[i].restSeconds>=5,i)
 assert.deepEqual(p.steps.slice(0,4).map(x=>[x.workSeconds,x.restSeconds]),
  Array.from({length:4},()=>[55,5]))
 assert.deepEqual(p.steps.filter(x=>x.part==='strength').map(x=>[x.workSeconds,x.restSeconds]),
  Array.from({length:24},()=>[40,20]))
 assert.deepEqual(p.steps.slice(-2).map(x=>[x.workSeconds,x.restSeconds]),[[55,5],[60,0]])
})
test('initial and final countdowns, side-change countdown and next-exercise GO signal',()=>{
 const plan=buildMovementPlan('2026-11-16',0)
 let x=startMovementPlayer()
 assert.equal(x.remaining,5)
 assert.equal(movementPlayerPhase(x),'prepare')
 x=tickMovementPlayer(x,plan);x=tickMovementPlayer(x,plan)
 assert.equal(x.remaining,3)
 assert.equal(movementPlayerCue(x,plan),'countdown-start')
 x=tickMovementPlayer(x,plan)
 assert.equal(x.remaining,2)
 assert.equal(movementPlayerCue(x,plan),'countdown-start')
 x=tickMovementPlayer(x,plan)
 assert.equal(x.remaining,1)
 assert.equal(movementPlayerCue(x,plan),'countdown-start')
 x=tickMovementPlayer(x,plan)
 const step=plan.steps[0]
 assert.equal(x.remaining,movementFirstSideSeconds(step))
 assert.equal(movementPlayerCue(x,plan),'go')
 for(let n=x.remaining;n>0;n--)x=tickMovementPlayer(x,plan)
 if(step.sideSwitch){
  assert.equal(movementPlayerPhase(x),'side-change')
  assert.equal(x.remaining,5)
  assert.equal(movementSideSwitchMoment(x,plan),true)
  for(let n=5;n>3;n--)x=tickMovementPlayer(x,plan)
  assert.equal(movementPlayerCue(x,plan),'countdown-start')
  for(let n=3;n>0;n--)x=tickMovementPlayer(x,plan)
  assert.equal(x.secondSide,true)
  assert.equal(x.remaining,movementSecondSideSeconds(step))
  assert.equal(movementPlayerCue(x,plan),'go')
  for(let n=x.remaining;n>0;n--)x=tickMovementPlayer(x,plan)
 }
 assert.equal(x.rest,true)
 assert.equal(x.remaining,movementRestSeconds(step))
 for(let n=x.remaining;n>0;n--)x=tickMovementPlayer(x,plan)
 assert.equal(x.index,1)
 assert.equal(movementPlayerCue(x,plan),'go')
})
test('screen wake lock and sound start from a user click and stop when leaving',()=>{
 assert.ok(studio.includes("navigator.wakeLock.request('screen')"))
 assert.ok(studio.includes("lock.release()"))
 assert.ok(studio.includes('visibilitychange'))
 assert.ok(studio.includes('setPlayer(p=>p?.running?{...p,running:false}:p)'))
 assert.ok(studio.includes('new AudioContext()'))
 assert.ok(studio.includes('playMovementBeep(audioRef.current,cue)'))
 assert.ok(studio.includes('Piep-Töne an'))
 assert.ok(studio.includes('onClick={begin}'))
})

test('unilateral exercises have exactly five seconds for the leg/side change',()=>{
 const all=read('src/lib/eiExercises.ts')
 for(const id of ['adductor-rockback','side-plank','clamshell','single-leg-calf-raise',
  'knee-to-wall','short-foot','single-leg-balance','hip-flexor-stretch',
  'thoracic-rotation','single-leg-glute-bridge']){
  const block=all.slice(all.indexOf('id: "'+id+'"'),all.indexOf('id: "'+id+'"')+420)
  assert.ok(block.includes('sideSwitch: true'),id)
 }
 let foundStrength=false,foundMobility=false,foundLast=false
 for(let rotation=0;rotation<14;rotation++){
  const plan=buildMovementPlan('2026-11-16',rotation)
  for(let i=0;i<plan.steps.length;i++){
   const step=plan.steps[i]
   if(!step.sideSwitch)continue
   const first=movementFirstSideSeconds(step)
   const second=movementSecondSideSeconds(step)
   const rest=movementRestSeconds(step)
   assert.equal(first+second+5+rest,step.workSeconds+step.restSeconds)
   assert.ok(first>0&&second>0&&rest>=0)
   let p={...startMovementPlayer(),index:i,prestart:false,remaining:first}
   for(let n=first;n>0;n--)p=tickMovementPlayer(p,plan)
   assert.equal(movementPlayerPhase(p),'side-change')
   assert.equal(p.remaining,5)
   assert.equal(movementSideSwitchMoment(p,plan),true)
   p=tickMovementPlayer(p,plan)
   assert.equal(p.remaining,4)
   assert.equal(movementSideSwitchMoment(p,plan),false)
   for(let n=4;n>0;n--)p=tickMovementPlayer(p,plan)
   assert.equal(p.secondSide,true)
   assert.equal(p.remaining,second)
   if(step.part==='strength'){
    foundStrength=true
    assert.equal(first,20)
    assert.equal(second,20)
    assert.equal(rest,15)
   }else if(step.restSeconds===5){
    foundMobility=true
    assert.equal(first,25)
    assert.equal(second,25)
    assert.equal(rest,5)
   }else{
    foundLast=true
    assert.equal(first+second,55)
    assert.equal(rest,0)
   }
  }
 }
 assert.equal(foundStrength,true)
 assert.equal(foundMobility,true)
 assert.equal(foundLast,true)
 assert.ok(studio.includes('exercise?.sideSwitch&&movementSideSwitchMoment(player,plan)'))
 assert.ok(studio.includes('↔ SEITE / FUSS WECHSELN'))
 assert.ok(studio.includes("if(cue==='switch')"))
})
test('session remains exactly 30 minutes plus the original 5-second opening prep',()=>{
 for(const date of ['2026-11-13','2026-11-16','2026-11-19']){
  for(const rotation of [0,1,2,3,7]){
   const plan=buildMovementPlan(date,rotation)
   let p=startMovementPlayer()
   let ticks=0
   while(!p.done&&ticks<1830){p=tickMovementPlayer(p,plan);ticks++}
   assert.equal(p.done,true,date+' rotation '+rotation)
   assert.equal(ticks,1805,date+' rotation '+rotation)
   assert.equal(p.index,29)
  }
 }
})
test('mobile audio is unlocked by user gesture and has an audible test action',()=>{
 assert.ok(studio.includes("session.type=enabled?'playback':'auto'"))
 assert.ok(studio.includes('audio.createBufferSource()'))
 assert.ok(studio.includes('audio.resume()'))
 assert.ok(studio.includes('void ready.then('))
 assert.ok(studio.includes('playMovementBeep(audio,\'go\')'))
 assert.ok(studio.includes('onClick={()=>unlockAudio(true)}'))
 assert.ok(studio.includes('Ton testen'))
 assert.ok(studio.includes('setWorkoutAudioSession(false)'))
})

test('work, recovery, changeover and manual pause render distinct visible states',()=>{
 const p=startMovementPlayer()
 assert.equal(movementPlayerPhase(p),'prepare')
 const work={...p,prestart:false,remaining:40}
 assert.equal(movementPlayerPhase(work),'work')
 const recovery={...work,rest:true,remaining:20}
 assert.equal(movementPlayerPhase(recovery),'rest')
 assert.equal(movementPlayerPhase({...recovery,remaining:6}),'rest')
 assert.equal(movementPlayerPhase({...recovery,remaining:5}),'switch')
 assert.equal(movementPlayerPhase({...recovery,remaining:3}),'switch')
 assert.equal(movementPlayerPhase({...work,sideChange:true,remaining:5}),'side-change')
 assert.equal(movementPlayerPhase({...work,running:false}),'paused')
 assert.equal(movementPlayerPhase({...recovery,running:false}),'paused')
 assert.equal(movementPlayerPhase({...work,done:true}),'done')
 const style=read('src/styles/exercise-comics.css')
 for(const color of ['work','rest','switch','paused']){
  assert.ok(style.includes('.ms-phase-'+color+' .ms-phase-banner'),color)
 }
 assert.ok(studio.includes('const phase=player?movementPlayerPhase(player)'))
 assert.ok(studio.includes("'ss-player ms-phase-'+phase"))
 assert.ok(studio.includes('phaseMessage.headline'))
 assert.ok(studio.includes('PAUSE – ERHOLEN'))
 assert.ok(studio.includes('JETZT AUSFÜHREN'))
 assert.ok(studio.includes('WECHSEL – BEREIT MACHEN'))
 assert.ok(studio.includes('SEITE / BEIN WECHSELN'))
 assert.ok(studio.includes('Nichts machen · kurz durchatmen'))
 assert.ok(style.includes('.ms-phase-side-change .ms-phase-banner'))
 assert.ok(studio.includes('ALS NÄCHSTES – NOCH NICHT STARTEN'))
 assert.ok(studio.includes("'Training anhalten':'Fortsetzen'"))
})

test('active, rest and changeover labels appear immediately below the countdown timer',()=>{
 const timer='<div className="ss-player-timer" aria-live="off">{formatClock(player.remaining)}</div>'
 const banner='<div className="ms-phase-banner" role="status" aria-live="polite">'
 const timerAt=studio.indexOf(timer)
 const bannerAt=studio.indexOf(banner)
 const illustrationAt=studio.indexOf('<div className="ss-player-art">')
 const sidePromptAt=studio.indexOf("className={'ms-side-prompt'")
 assert.ok(timerAt>0)
 assert.ok(illustrationAt>0&&illustrationAt<timerAt)
 assert.equal(bannerAt,timerAt+timer.length+5)
 assert.ok(sidePromptAt>bannerAt)
 assert.equal(studio.split(banner).length-1,1)
 assert.ok(read('src/styles/exercise-comics.css').includes('.ss-player-timer+.ms-phase-banner'))
})

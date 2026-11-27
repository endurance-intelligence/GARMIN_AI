import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {instanceStoragePrefix,PRIMARY_URL} from './validate-public-config.mjs'
import {buildCoachStructuredSnapshot,coachWorkoutAllowed} from '../supabase/functions/_shared/coach-structured-workout.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
import {quickCoachAction} from '../src/lib/calendarQuickAccept.mjs'
import {buildIntervalsEvent,buildIntervalsWorkout,validateStoredIntervalsWorkout} from '../supabase/functions/_shared/intervals-workout.mjs'
import {assessPlanActual} from '../src/lib/planActual.mjs'
const require=createRequire(join(process.env.SMOKE_TOOLS_DIR,'package.json'))
const {chromium}=require('playwright')
const origin='http://127.0.0.1:'+(process.env.SMOKE_PORT||'4173')
const secondary=process.env.VITE_GARMIN_INSTANCE==='secondary'
const url=origin+(secondary?'/GARMIN_AI/athlete/':'/GARMIN_AI/')
const supabase=new URL(process.env.VITE_GARMIN_SUPABASE_URL)
const storageKey='sb-'+supabase.hostname.split('.')[0]+'-auth-token'
const prefix=instanceStoragePrefix(supabase.origin,secondary?'secondary':'primary')
const primaryStorageKey='sb-'+new URL(PRIMARY_URL).hostname.split('.')[0]+'-auth-token'
const uid='00000000-0000-4000-8000-000000000004'
const expires=Math.floor(Date.now()/1000)+3600
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,aud:'authenticated',role:'authenticated',exp:expires,iat:expires-3600})+'.'+Buffer.from('fixture-not-a-real-token').toString('base64url')
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2025-01-01T00:00:00Z'}
const session={access_token:token,refresh_token:'fixture-not-a-real-refresh-token',expires_at:expires,expires_in:3600,token_type:'bearer',user}
const activities=['fixture-a','fixture-b'].map((id,i)=>({id,name:'Fixture Run '+(i+1),date:'2026-11-25',sport:'running',distanceM:5000,durationS:1800,avgHr:135,rpeRaw:2,detailStatus:'partial',hrSamples:0,laps:0}))
const browser=await chromium.launch({headless:true})
async function context(mode,width,height,flow=null){
 const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'})
 // No authenticated network request ever leaves this browser: all non-local
 // traffic is intercepted, including Garmin, Supabase, weather and Intervals.
 await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin===origin)return route.continue()
  if(u.origin!==supabase.origin)return route.abort()
  const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','content-type':'application/json'}
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
  const send=(status,body)=>route.fulfill({status,headers,body:JSON.stringify(body)})
  if(u.pathname==='/functions/v1/garmin-app-access')return send(mode==='owner'||mode==='onboarding'?200:403,{authorized:mode==='owner'||mode==='onboarding'})
  if(u.pathname==='/auth/v1/user'&&req.method()==='GET')return send(200,user)
  if(mode==='onboarding'&&u.pathname==='/functions/v1/garmin-athlete-profile'){
   if(req.method()==='GET')return send(200,{profile:null,garminKeyConfigured:false})
   const b=req.postDataJSON()
   assert.equal(b.action,'save');assert.equal(b.confirm,true);assert.equal(b.profile.cycleEnabled,false)
   assert.deepEqual(b.profile.sports,['running']);assert.equal(b.profile.daysPerWeek,3)
   return send(200,{saved:true,profile:b.profile})
  }
  if(mode==='onboarding'&&u.pathname==='/functions/v1/garmin-training-history'&&u.searchParams.get('rhythm')==='1')return send(200,{rhythm:{rowing:{days:[],minutes:30},strength:{days:[],minutes:30}}})
  if(flow){
   const name=u.pathname.split('/').at(-1)
   const body=req.method()==='POST'?req.postDataJSON():null
   if(name==='garmin-training-history'&&req.method()==='GET')return send(200,{rhythm:flow.snapshot.life.trainingRhythm})
   if(name==='garmin-training-history'&&req.method()==='POST'&&body?.snapshot&&body?.requestId){
    // Automatic immutable evidence archiving is not a training-plan mutation.
    assert.ok(Array.isArray(body.snapshot.entries))
    assert.ok(body.snapshot.weekStart)
    return send(200,{revision:{id:body.requestId,week_start:body.snapshot.weekStart,created_at:flow.snapshot.today+'T11:00:00Z',snapshot:body.snapshot}})
   }
   if(name==='garmin-coach-archive'&&req.method()==='GET')return send(200,{...flow.snapshot,plans:{entries:flow.plan?[flow.plan]:[]}})
   if(name==='garmin-week-board'&&req.method()==='GET')return send(200,{start:u.searchParams.get('start'),endExclusive:coachAddDays(u.searchParams.get('start'),7),activities:[],manual:[],health:[]})
   if(name==='garmin-weekly-options'&&req.method()==='GET')return send(200,flow.snapshot.options)
   if(name==='garmin-training-plan'&&req.method()==='GET')return send(200,{entries:flow.plan?[flow.plan]:[]})
   if(name==='garmin-intervals'&&req.method()==='GET')return send(200,{configured:true,eligiblePlanIds:flow.plan?[flow.plan.id]:[],publications:flow.plan?[flow.plan]:[]})
   if(name==='garmin-training-plan'&&body?.action==='create_coach_workout'){
    flow.writes.push('create')
    assert.equal(flow.plan,null,'one draft only')
    assert.ok(coachWorkoutAllowed(flow.snapshot.life.context,body.kind,body.date))
    const snap=buildCoachStructuredSnapshot(body)
    assert.ok(snap,'real server snapshot builder accepts UI payload')
    flow.plan={id:'00000000-0000-4000-8000-000000000005',training_date:body.date,title:body.title,state:'draft',session_type:'event',sport:'running',revision:1,archive_snapshot:snap,garmin_workout_id:null,notes:'Fixture',intervals_event_id:null,intervals_published_revision:null,intervals_sync_status:'not_published',intervals_export_version:null}
    return send(201,{saved:true,id:flow.plan.id,state:'draft',revision:1})
   }
   if(name==='garmin-training-plan'&&body?.action==='move'){
    flow.writes.push('move')
    assert.equal(body.id,flow.plan?.id)
    assert.equal(body.revision,flow.plan?.revision)
    assert.equal(flow.plan?.intervals_sync_status,'not_published')
    assert.notEqual(body.date,flow.plan.training_date)
    flow.plan={...flow.plan,training_date:body.date,state:'draft',revision:flow.plan.revision+1,approved_at:null}
    return send(200,{saved:true,id:flow.plan.id,state:'draft',revision:flow.plan.revision,training_date:flow.plan.training_date})
   }
   if(name==='garmin-training-plan'&&body?.action==='approve'){
    flow.writes.push('approve')
    assert.equal(flow.plan?.state,'draft')
    assert.equal(body.id,flow.plan.id)
    assert.equal(body.revision,flow.plan.revision)
    flow.plan={...flow.plan,state:'pending',revision:flow.plan.revision+1,approved_at:'2026-11-17T12:00:00Z'}
    return send(200,{saved:true,id:flow.plan.id,state:'pending',revision:flow.plan.revision})
   }
   if(name==='garmin-intervals'&&body?.action==='publish'){
    flow.writes.push('publish')
    assert.equal(flow.plan?.state,'pending')
    assert.equal(body.planId,flow.plan.id)
    const event=buildIntervalsEvent(flow.plan)
    const workout=buildIntervalsWorkout(flow.plan.archive_snapshot,flow.plan.title)
    const remote={...event,id:12345,moving_time:workout.steps.reduce((n,s)=>n+s.durationSeconds,0),distance:0,workout_doc:{steps:workout.steps.map(s=>({duration:s.durationSeconds,until_lap_press:false}))}}
    assert.equal(validateStoredIntervalsWorkout(remote,flow.plan.archive_snapshot,event).ok,true)
    flow.plan={...flow.plan,intervals_event_id:remote.id,intervals_published_revision:flow.plan.revision,intervals_sync_status:'confirmed',intervals_export_version:2}
    // Legacy already-published reply omits the ID; a lost response must be
    // reconciled from the owner read rather than requiring another write.
    return send(200,{published:true,alreadyPublished:true,intervalsConfirmed:true,garminConfirmed:false})
   }
   if(req.method()==='POST'){flow.writes.push('unexpected:'+name+':'+body?.action);return send(409,{error:'Unexpected fixture write'})}
  }
  if(u.pathname==='/functions/v1/read-garmin-session'&&req.method()==='GET'&&!u.searchParams.has('id'))return send(200,{source:'fixture',activities})
  if(u.pathname==='/functions/v1/garmin-training-plan'&&req.method()==='GET')return send(200,{entries:[]})
  return send(503,{error:'Fixture intentionally unavailable'})
 })
 await ctx.addInitScript(({storageKey,session,prefix,primaryStorageKey,secondary,mode})=>{
  if(secondary){
   // A valid primary session must never authorize the other project.
   localStorage.setItem(primaryStorageKey,JSON.stringify(session))
   sessionStorage.setItem('garmin-ai:last-page:v1','race')
  }
  if(mode!=='anonymous'){
   if(secondary&&mode!=='onboarding')localStorage.setItem(prefix+'garmin-ai-onboarding-v1:'+session.user.id,'done')
   localStorage.setItem(storageKey,JSON.stringify(session))
   sessionStorage.setItem(prefix+'garmin-ai:last-page:v1','training')
  }
 },{storageKey,session,prefix,primaryStorageKey,secondary,mode})
 const page=await ctx.newPage()
 const errors=[]
 page.on('pageerror',err=>errors.push(err.message))
 if(flow)await page.clock.setFixedTime(new Date(flow.snapshot.today+'T11:00:00Z'))
 await page.goto(url,{waitUntil:'domcontentloaded'})
 return {ctx,page,errors}
}
try{
 if(secondary){
  const setup=await context('onboarding',390,844)
  await setup.page.getByRole('heading',{name:'Willkommen bei GARMIN_AI.'}).waitFor()
  assert.equal(await setup.page.locator('.app').count(),0)
  await setup.page.getByRole('button',{name:'Weiter / später ergänzen'}).click()
  await setup.page.getByRole('heading',{name:'Trainings auf deine Uhr übertragen'}).waitFor()
  await setup.page.getByRole('button',{name:'Weiter / später ergänzen'}).click()
  await setup.page.getByRole('heading',{name:'Welche Sportarten möchtest du machen?'}).waitFor()
  await setup.page.getByRole('checkbox',{name:'Laufen',exact:true}).check()
  await setup.page.getByRole('button',{name:'Weiter / später ergänzen'}).click()
  await setup.page.getByRole('heading',{name:'Wann möchtest du trainieren?'}).waitFor()
  await setup.page.getByLabel('Trainingstage pro Woche').selectOption('3')
  await setup.page.getByLabel('Zeit pro Einheit').selectOption('30')
  await setup.page.getByRole('button',{name:'Weiter / später ergänzen'}).click()
  await setup.page.getByRole('heading',{name:'Was möchtest du erreichen?'}).waitFor()
  await setup.page.getByRole('radio',{name:'Allgemeine Fitness'}).check()
  await setup.page.getByRole('radio',{name:'Einsteigerin / Einsteiger'}).check()
  await setup.page.getByRole('button',{name:'Weiter / später ergänzen'}).click()
  await setup.page.getByRole('heading',{name:'Women\'s Health – freiwillig'}).waitFor()
  assert.equal(await setup.page.getByRole('checkbox',{name:/Ich möchte die Zyklusabfrage/}).isChecked(),false)
  await setup.page.getByRole('button',{name:'Weiter / später ergänzen'}).click()
  await setup.page.getByRole('button',{name:'Profil speichern & Dashboard'}).click()
  await setup.page.locator('.footmobile').waitFor()
  assert.equal(await setup.page.evaluate(key=>localStorage.getItem(key),prefix+'garmin-ai-onboarding-v1:'+uid),'done')
  assert.equal(await setup.page.evaluate(key=>localStorage.getItem(key),'garmin-ai-onboarding-v1:'+uid),null)
  assert.deepEqual(setup.errors,[])
  await setup.ctx.close()
 }
 const anon=await context('anonymous',390,844)
 await anon.page.getByRole('button',{name:'Login-Link senden'}).waitFor()
 assert.equal(await anon.page.locator('.app').count(),0,'anonymous must not mount private app')
 assert.deepEqual(anon.errors,[])
 await anon.ctx.close()
 const denied=await context('denied',390,844)
 await denied.page.getByText('Dieses Konto ist nicht für den privaten GARMIN_AI-Bereich freigegeben.').waitFor()
 assert.equal(await denied.page.locator('.app').count(),0,'denied must not mount private app')
 assert.deepEqual(denied.errors,[])
 await denied.ctx.close()
 for(const [width,height] of [[390,844],[820,1180],[1440,900]]){
  const {ctx,page,errors}=await context('owner',width,height)
  const nav=page.locator(width<=1024?'.footmobile':'.sidebar .nav')
  await nav.waitFor()
  assert.equal(await nav.getByRole('button').count(),6)
  for(const button of await nav.getByRole('button').all()){
   assert.ok(await button.isVisible(),'visible navigation button')
   const rect=await button.boundingBox()
   assert.ok(rect&&rect.height>=44&&rect.x>=-1&&rect.x+rect.width<=width+1,'reachable navigation at '+width)
  }
  const picker=page.locator('.lsa-picker select')
  await picker.locator('option[value="fixture-b"]').waitFor({state:'attached'})
  await picker.selectOption('fixture-b')
  await page.locator('.lsa-head').getByRole('button',{name:'Aktualisieren'}).click()
  await page.waitForFunction(()=>document.querySelector('.lsa-picker select')?.value==='fixture-b')
  await page.getByRole('button',{name:'Historie Wochen & Monate'}).click()
  await page.getByRole('heading',{name:'Meine Trainingshistorie'}).waitFor()
  assert.equal(await page.locator('.lsa-picker').count(),0)
  await page.getByRole('button',{name:'Entwicklung Fortschritt & Trends'}).click()
  await page.getByRole('heading',{name:'Meine Entwicklung'}).waitFor()
  assert.equal(await page.locator('#training-history').count(),0)
  await page.getByRole('button',{name:'Einzelanalyse Lauf & Coach-Fazit'}).click()
  await picker.waitFor()
  await page.waitForFunction(()=>document.querySelector('.lsa-picker select')?.value==='fixture-b')
  await nav.getByRole('button',{name:'Mehr',exact:true}).click()
  await page.getByRole('button',{name:/Equipment/}).click()
  await page.getByRole('button',{name:'Zurück zu Mehr'}).click()
  await page.getByRole('button',{name:/Stabi Studio/}).waitFor()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'no full-page horizontal overflow at '+width)
  if(secondary){
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('garmin-ai:last-page:v1')),'race','primary navigation is untouched')
   assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),prefix+'garmin-ai:last-page:v1'),'more','secondary navigation stays in its own namespace')
  }
  assert.deepEqual(errors,[],'no uncaught browser errors at '+width)
  await ctx.close()
 }

// Full browser path against isolated, stateful transport fixtures. The actual
// planner, server workout constructor, serializer and matcher are exercised.
 const today='2026-11-17',start='2026-11-16'
 const rhythm={rowing:{days:[],minutes:30},strength:{days:[],minutes:30}}
 const snapshot={today,health:{metrics:Array.from({length:18},(_,i)=>({metric_date:coachAddDays(today,i-17),hrv_ms:51,resting_heart_rate:43,sleep_seconds:8*3600})),training:{runKm7:42,previousRunKm7:39,truncated:false,historyStatus:'complete'}},boards:[{start,activities:[],manual:[]}],options:{options:[],choices:[]},plans:{entries:[]},goal:{goal:{race_date:coachAddDays(today,4),race_name:'Synthetic race',distance_km:50}},life:{context:{illness_state:'well',return_started_on:null,blocked_periods:[],run_reviews:[]},runs:[],trainingRhythm:rhythm}}
 // Exercise the morning panel with real-shaped but entirely synthetic measured rows.
 snapshot.health.metrics=snapshot.health.metrics.map(r=>({...r,stress_avg:24,body_battery_max:87}))
 snapshot.health.longRecoveryMetrics=snapshot.health.metrics.map(r=>({...r,sleepDetail:{score:81,deepSeconds:3600,lightSeconds:18000,remSeconds:7200,awakeSeconds:600,sleepStress:20}}))
 const morningFlow={snapshot,plan:null,writes:[]}
 const morning=await context('owner',390,844,morningFlow)
 await morning.page.locator('.footmobile').getByRole('button',{name:'Coach',exact:true}).click()
 const panel=morning.page.getByRole('region',{name:'Garmin Erholung mit grafischen Trends'})
 await panel.getByText('Garmin Sleep Score',{exact:false}).waitFor()
 await panel.getByText('87 / 100',{exact:true}).waitFor()
 await panel.getByText('24 / 100',{exact:true}).waitFor()
 assert.equal(await panel.locator('.co-sleep-bar .co-sleep-stage').count(),4)
 assert.equal(await panel.locator('.co-metric-status').count(),6)
 assert.equal(await panel.locator('.co-metric-reference').count(),1,'one shared personal comparison below the tiles')
 assert.ok(await panel.getByText('Smileys: Vergleich mit deinen eigenen Werten der vorherigen 14 Tage. Kein allgemeiner Gesundheitswert.',{exact:true}).isVisible(),'personal 14-day reference is visible')
 assert.equal(await morning.page.locator('.cav-root').count(),0,'no premature weekly learning card')
 const avatar=await panel.locator('.co-recovery-insight .coach-avatar').boundingBox()
 assert.ok(avatar&&avatar.width>=80,'morning coach avatar full size')
 assert.ok(await morning.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'morning mobile layout has no horizontal overflow')
 assert.deepEqual(morning.errors,[])
 await morning.ctx.close()
 const recommendation=buildSevenDayCoach(snapshot)
 const candidate=recommendation.days.find(d=>d.date<=coachAddDays(start,6)&&d.sport==='running'&&quickCoachAction(recommendation,d.date,today)==='draft')
 assert.ok(candidate,'fixture must offer a real draftable running recommendation')
 const flow={snapshot,plan:null,writes:[]}
 const {ctx:flowCtx,page:flowPage,errors:flowErrors}=await context('owner',390,844,flow)
 await flowPage.locator('.footmobile').getByRole('button',{name:'Kalender',exact:true}).click()
 const dayLabel=candidate.date.slice(8,10)+'.'+candidate.date.slice(5,7)+'.'
 const accept=flowPage.getByRole('group',{name:'Entscheidung '+dayLabel,exact:true}).getByRole('button',{name:/^Annehmen/})
 await accept.waitFor()
 assert.deepEqual(flow.writes,[],'no implicit draft, approval or publish')
 await accept.click()
 await flowPage.getByRole('button',{name:'Training freigeben',exact:true}).waitFor()
 assert.deepEqual(flow.writes,['create'])
 assert.equal(await flowPage.getByRole('button',{name:'An Intervals.icu senden',exact:true}).count(),0)
 assert.ok(await flowPage.locator('.hwb-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'phone agenda fits width')
 const savedId=flow.plan.id, savedWorkout=JSON.stringify(flow.plan.archive_snapshot)
 const target=candidate.date===today?coachAddDays(candidate.date,1):coachAddDays(candidate.date,-1)
 await flowPage.getByRole('button',{name:'Verschieben',exact:true}).click()
 await flowPage.getByLabel('Neues Trainingsdatum',{exact:true}).fill(target)
 assert.deepEqual(flow.writes,['create'],'selecting a date is not a write')
 await flowPage.getByRole('button',{name:'Verschieben bestätigen',exact:true}).click()
 await flowPage.getByText('Training verschoben:',{exact:false}).waitFor()
 assert.deepEqual(flow.writes,['create','move'])
 assert.equal(flow.plan.id,savedId)
 assert.equal(flow.plan.training_date,target)
 assert.equal(JSON.stringify(flow.plan.archive_snapshot),savedWorkout)
 await flowPage.getByRole('button',{name:'Training freigeben',exact:true}).waitFor()
 await flowPage.getByRole('button',{name:'Training freigeben',exact:true}).click()
 await flowPage.getByRole('button',{name:'An Intervals.icu senden',exact:true}).waitFor()
 assert.deepEqual(flow.writes,['create','move','approve'],'approval does not publish')
 await flowPage.getByRole('button',{name:'An Intervals.icu senden',exact:true}).click()
 await flowPage.getByText('Übertragung bestätigt – die Browserantwort war unterbrochen.',{exact:false}).waitFor()
 assert.equal(await flowPage.getByRole('button',{name:'An Intervals.icu senden',exact:true}).count(),0)
 assert.deepEqual(flow.writes,['create','move','approve','publish'],'missing remote ID is reconciled without duplicate publish')
 assert.equal(flow.plan.intervals_published_revision,flow.plan.revision)
 assert.equal(flow.plan.intervals_event_id,12345)
 assert.equal(await flowPage.getByRole('button',{name:'Verschieben',exact:true}).count(),0,'published workout cannot be locally moved')
 const actual={id:'synthetic-run',date:flow.plan.training_date+' '+flow.plan.archive_snapshot.startTime+':00',sport:'running',durationS:candidate.minutes*60+120,avgHr:135,distanceM:5000}
 const matched=assessPlanActual(actual,[actual],[flow.plan])
 assert.equal(matched.status,'matched')
 assert.equal(matched.plan.durationDeltaMinutes,2)
 assert.deepEqual(flowErrors,[])
 await flowCtx.close()
 console.log('Coach browser workflow passed: proposal, explicit draft, separate approval, publish reconciliation, no duplicate and measured plan-actual.')

 console.log('Browser smoke passed: anonymous, denied, isolated owner navigation, three viewports, manual session selection.')
}finally{await browser.close()}

import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
const require=createRequire(join(process.env.SMOKE_TOOLS_DIR,'package.json'))
const {chromium}=require('playwright')
const origin='http://127.0.0.1:4173'
const url=origin+'/GARMIN_AI/'
const supabase=new URL(process.env.VITE_GARMIN_SUPABASE_URL)
const storageKey='sb-'+supabase.hostname.split('.')[0]+'-auth-token'
const uid='00000000-0000-4000-8000-000000000004'
const expires=Math.floor(Date.now()/1000)+3600
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,aud:'authenticated',role:'authenticated',exp:expires,iat:expires-3600})+'.'+Buffer.from('fixture-not-a-real-token').toString('base64url')
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2025-01-01T00:00:00Z'}
const session={access_token:token,refresh_token:'fixture-not-a-real-refresh-token',expires_at:expires,expires_in:3600,token_type:'bearer',user}
const activities=['fixture-a','fixture-b'].map((id,i)=>({id,name:'Fixture Run '+(i+1),date:'2026-11-25',sport:'running',distanceM:5000,durationS:1800,avgHr:135,rpeRaw:2,detailStatus:'partial',hrSamples:0,laps:0}))
const browser=await chromium.launch({headless:true})
async function context(mode,width,height){
 const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'})
 // No authenticated network request ever leaves this browser: all non-local
 // traffic is intercepted, including Garmin, Supabase, weather and Intervals.
 await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin===origin)return route.continue()
  if(u.origin!==supabase.origin)return route.abort()
  const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'*','content-type':'application/json'}
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
  const send=(status,body)=>route.fulfill({status,headers,body:JSON.stringify(body)})
  if(u.pathname==='/functions/v1/garmin-app-access')return send(mode==='owner'?200:403,{authorized:mode==='owner'})
  if(u.pathname==='/auth/v1/user'&&req.method()==='GET')return send(200,user)
  if(u.pathname==='/functions/v1/read-garmin-session'&&req.method()==='GET'&&!u.searchParams.has('id'))return send(200,{source:'fixture',activities})
  if(u.pathname==='/functions/v1/garmin-training-plan'&&req.method()==='GET')return send(200,{entries:[]})
  return send(503,{error:'Fixture intentionally unavailable'})
 })
 if(mode!=='anonymous')await ctx.addInitScript(({storageKey,session})=>{
  localStorage.setItem(storageKey,JSON.stringify(session))
  sessionStorage.setItem('garmin-ai:last-page:v1','training')
 },{storageKey,session})
 const page=await ctx.newPage()
 const errors=[]
 page.on('pageerror',err=>errors.push(err.message))
 await page.goto(url,{waitUntil:'domcontentloaded'})
 return {ctx,page,errors}
}
try{
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
  assert.deepEqual(errors,[],'no uncaught browser errors at '+width)
  await ctx.close()
 }
 console.log('Browser smoke passed: anonymous, denied, isolated owner navigation, three viewports, manual session selection.')
}finally{await browser.close()}

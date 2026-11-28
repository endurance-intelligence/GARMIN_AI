/** Owner-only onboarding preferences and opt-in, read-only Garmin capability check. */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
import {createGarminPersonalClient,GarminPersonalDeferred} from '../_shared/garmin-personal-client.mjs'
import {normalizeAthleteProfile,cycleAvailability,profileFieldAvailability} from '../../../src/lib/athleteProfile.mjs'
import {emptyHealthPreferences,normalizeHealthPreferences,explicitGarminProfile,weighReminderDue} from '../../../src/lib/healthPreferences.mjs'
import {publicCycleState} from '../../../src/lib/cycleHistory.mjs'
import {syncCycleHistory} from '../_shared/cycle-history-sync.ts'
const healthDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
function key(kind:'public'|'secret'){
 try{const value=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}');if(typeof value.default==='string'&&value.default)return value.default}catch{/* legacy */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),allowed=origin==='https://endurance-intelligence.github.io'||!!origin&&/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
 const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:h})
 if(origin&&!allowed)return reply(403,{error:'Origin forbidden'})
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'})
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))return reply(503,{error:'Athletenprofil nicht eingerichtet'})
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Anmeldung erforderlich'})
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return reply(401,{error:'Ungültige Anmeldung'})
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)return reply(403,{error:'Zugriff nicht erlaubt'})
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const todayHealth=healthDay()
  const readCycle=async()=>{
   const {data,error}=await db.from('garmin_cycle_history').select('enabled,status,last_attempt_on,observations').eq('user_id',user.id).maybeSingle()
   if(error)throw Error('cycle_history_read')
   return publicCycleState(data,todayHealth)
  }
  if(req.method==='GET'&&new URL(req.url).searchParams.get('cycle')==='1')return reply(200,await readCycle())
  const readHealth=async()=>{
   const {data:row,error}=await db.from('garmin_health_preferences').select('height_cm,birth_year,adult_confirmed,weigh_reminder,dismissed_date').eq('user_id',user.id).maybeSingle()
   if(error)throw Error('health_preferences_read')
   const preferences=row?normalizeHealthPreferences({heightCm:row.height_cm===null?null:Number(row.height_cm),birthYear:row.birth_year,adultConfirmed:row.adult_confirmed,weighReminder:row.weigh_reminder},todayHealth):emptyHealthPreferences()
   if(!preferences)throw Error('health_preferences_invalid')
   // Existing single-athlete weight store, read only whether today is present.
   const {data:weigh,error:weightError}=await db.from('garmin_weight_outbox').select('weigh_date').eq('weigh_date',todayHealth).maybeSingle()
   if(weightError)throw Error('weight_status_read')
   return {preferences,reminderDue:weighReminderDue(preferences,todayHealth,weigh?[todayHealth]:[],row?.dismissed_date),date:todayHealth}
  }
  if(req.method==='GET'&&new URL(req.url).searchParams.get('health')==='1')return reply(200,await readHealth())
  const {data:row,error:readError}=await db.from('garmin_athlete_profile').select('profile').eq('user_id',user.id).maybeSingle()
  if(readError)return reply(503,{error:'Athletenprofil nicht erreichbar'})
  const profile=row?normalizeAthleteProfile(row.profile):null
  if(row&&!profile)return reply(503,{error:'Athletenprofil ungültig'})
  const configured=!!Deno.env.get('GARMIN_API_KEY')
  if(req.method==='GET')return reply(200,{profile,garminKeyConfigured:configured})
  const raw=await req.text()
  if(raw.length>4000)return reply(413,{error:'Anfrage zu groß'})
  let input;try{input=JSON.parse(raw)}catch{return reply(422,{error:'Ungültiges JSON'})}
  if(!input||input.confirm!==true)return reply(422,{error:'Bestätigung erforderlich'})
  if(input.action==='cycle_consent'){
   if(typeof input.enabled!=='boolean')return reply(422,{error:'Zyklusfreigabe ungültig'})
   const current=await readCycle()
   if(current.enabled!==input.enabled){
    const {error}=await db.from('garmin_cycle_history').upsert({user_id:user.id,enabled:input.enabled,generation:crypto.randomUUID(),observations:[],last_attempt_on:null,status:'idle',updated_at:new Date().toISOString()},{onConflict:'user_id'})
    if(error)return reply(503,{error:'Zyklusfreigabe nicht gespeichert'})
   }
   return reply(200,await readCycle())
  }
  if(input.action==='sync_cycle_today'){
   if(!(await readCycle()).enabled)return reply(403,{error:'Automatische Zyklusfreigabe fehlt'})
   const apiKey=Deno.env.get('GARMIN_API_KEY')||''
   if(!apiKey)return reply(503,{error:'Garmin nicht eingerichtet'})
   try{
    const api=await createGarminPersonalClient(db,apiKey,project)
    await api.ready()
    const token=await api.getToken()
    await syncCycleHistory(db,user.id,api.fetch,token)
    return reply(200,await readCycle())
   }catch{return reply(503,{error:'Zyklusabgleich derzeit nicht verfügbar'})}
  }
  if(input.action==='save_health'){
   const next=normalizeHealthPreferences(input.preferences,todayHealth)
   if(!next)return reply(422,{error:'Gesundheitsprofil ungültig'})
   const {error}=await db.from('garmin_health_preferences').upsert({user_id:user.id,height_cm:next.heightCm,birth_year:next.birthYear,adult_confirmed:next.adultConfirmed,weigh_reminder:next.weighReminder,updated_at:new Date().toISOString()},{onConflict:'user_id',defaultToNull:false})
   if(error)return reply(503,{error:'Gesundheitsprofil nicht gespeichert'})
   return reply(200,{saved:true,...await readHealth()})
  }
  if(input.action==='dismiss_weigh'){
   const {error}=await db.from('garmin_health_preferences').update({dismissed_date:todayHealth,updated_at:new Date().toISOString()}).eq('user_id',user.id)
   if(error)return reply(503,{error:'Erinnerung nicht geändert'})
   return reply(200,await readHealth())
  }
  if(input.action==='save'){
   const next=normalizeAthleteProfile(input.profile)
   if(!next)return reply(422,{error:'Athletenprofil unvollständig oder ungültig'})
   const {data,error}=await db.from('garmin_athlete_profile').upsert({user_id:user.id,profile:next,updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('profile').single()
   if(error||!data)return reply(503,{error:'Profil nicht gespeichert'})
   return reply(200,{saved:true,profile:normalizeAthleteProfile(data.profile),trainingPlanChanged:false})
  }
  if(input.action==='check_profile'||input.action==='prefill_health'){
   const apiKey=Deno.env.get('GARMIN_API_KEY')||''
   if(!apiKey)return reply(200,{status:'garmin-not-configured'})
   try{
    const api=await createGarminPersonalClient(db,apiKey,project)
    await api.ready()
    const token=await api.getToken()
    const r=await api.fetch('https://personal.connectapi.garmin.com/userprofile-service/userprofile/settings',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})
    if(r.status===429)return reply(200,{status:'garmin-rate-limited'})
    if(!r.ok||r.status===204)return reply(200,{status:'garmin-unavailable'})
    const rawProfile=await r.json()
    if(input.action==='prefill_health')return reply(200,{status:'profile-prefill',candidate:explicitGarminProfile(rawProfile)})
    return reply(200,{status:'profile-checked',fields:profileFieldAvailability(rawProfile)})
   }catch(e){return reply(200,{status:e instanceof GarminPersonalDeferred&&e.status===429?'garmin-rate-limited':'garmin-unavailable'})}
  }
  if(input.action==='check_cycle'){
   if(profile?.cycleEnabled!==true)return reply(403,{error:'Zyklusfreigabe fehlt'})
   const apiKey=Deno.env.get('GARMIN_API_KEY')||''
   if(!apiKey)return reply(200,{status:'garmin-not-configured'})
   const base='https://personal.connectapi.garmin.com'
   try{
    const api=await createGarminPersonalClient(db,apiKey,project)
    await api.ready()
    const token=await api.getToken()
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
    const part=(k:string)=>parts.find(p=>p.type===k)?.value||''
    const today=part('year')+'-'+part('month')+'-'+part('day')
    const r=await api.fetch(base+'/periodichealth-service/menstrualcycle/summary/'+today,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})
    if(r.status===429)return reply(200,{status:'garmin-rate-limited'})
    if(!r.ok||r.status===204)return reply(200,{status:'cycle-unavailable'})
    // Only capability state leaves this function. Never store or log the raw response.
    return reply(200,{status:cycleAvailability(await r.json())})
   }catch(e){return reply(200,{status:e instanceof GarminPersonalDeferred&&e.status===429?'garmin-rate-limited':'cycle-unavailable'})}
  }
  return reply(422,{error:'Ungültige Aktion'})
 }catch{return reply(503,{error:'Athletenprofil nicht erreichbar'})}
})

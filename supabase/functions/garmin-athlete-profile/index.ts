/** Owner-only onboarding preferences and opt-in, read-only Garmin capability check. */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
import {normalizeAthleteProfile,cycleAvailability} from '../../../src/lib/athleteProfile.mjs'
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
  if(input.action==='save'){
   const next=normalizeAthleteProfile(input.profile)
   if(!next)return reply(422,{error:'Athletenprofil unvollständig oder ungültig'})
   const {data,error}=await db.from('garmin_athlete_profile').upsert({user_id:user.id,profile:next,updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('profile').single()
   if(error||!data)return reply(503,{error:'Profil nicht gespeichert'})
   return reply(200,{saved:true,profile:normalizeAthleteProfile(data.profile),trainingPlanChanged:false})
  }
  if(input.action==='check_cycle'){
   if(profile?.cycleEnabled!==true)return reply(403,{error:'Zyklusfreigabe fehlt'})
   const apiKey=Deno.env.get('GARMIN_API_KEY')||''
   if(!apiKey)return reply(200,{status:'garmin-not-configured'})
   const base='https://personal.connectapi.garmin.com'
   try{
    const response=await fetch(base+'/personalapitoken-service/personal-api/personal-api-key/token',{method:'POST',headers:{Authorization:'ApiKey '+apiKey},redirect:'error',signal:AbortSignal.timeout(15000)})
    if(!response.ok)return reply(200,{status:'garmin-unavailable'})
    const token=(await response.text()).trim().replace(/^"|"$/g,'')
    if(!/^[A-Za-z0-9_+/.=-]{20,2048}$/.test(token))return reply(200,{status:'garmin-unavailable'})
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
    const part=(k:string)=>parts.find(p=>p.type===k)?.value||''
    const today=part('year')+'-'+part('month')+'-'+part('day')
    const r=await fetch(base+'/periodichealth-service/menstrualcycle/summary/'+today,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})
    if(!r.ok)return reply(200,{status:'cycle-unavailable'})
    // Only capability state leaves this function. Never store or log the raw response.
    return reply(200,{status:cycleAvailability(await r.json())})
   }catch{return reply(200,{status:'cycle-unavailable'})}
  }
  return reply(422,{error:'Ungültige Aktion'})
 }catch{return reply(503,{error:'Athletenprofil nicht erreichbar'})}
})

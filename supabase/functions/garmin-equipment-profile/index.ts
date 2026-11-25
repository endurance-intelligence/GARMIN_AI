/** Only owner-confirmed equipment availability. No Garmin or training-plan writes. */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const ids=['bodyweight','rowing','treadmill','bike','trainer']
function key(kind:'public'|'secret'){
 try{const value=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}');if(typeof value.default==='string'&&value.default)return value.default}catch{/* legacy */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
type Profile={available:string[];treadmillMaxInclinePct:number|null}
function validate(value:unknown):Profile|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const p=value as Record<string,unknown>,available=p.available,incline=p.treadmillMaxInclinePct
 if(!Array.isArray(available)||available.some(x=>typeof x!=='string'||!ids.includes(x))||new Set(available).size!==available.length)return null
 if(incline!==null&&(typeof incline!=='number'||!available.includes('treadmill')||!Number.isFinite(incline)||incline<0||incline>40||Math.round(incline*10)!==incline*10))return null
 return {available:ids.filter(x=>available.includes(x)),treadmillMaxInclinePct:incline as number|null}
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),allowed=origin==='https://endurance-intelligence.github.io'||!!origin&&/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
 const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:h})
 if(origin&&!allowed)return reply(403,{error:'Origin forbidden'})
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'})
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))return reply(503,{error:'Ausrüstungsprofil nicht eingerichtet'})
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Anmeldung erforderlich'})
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return reply(401,{error:'Ungültige Anmeldung'})
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)return reply(403,{error:'Zugriff nicht erlaubt'})
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  if(req.method==='GET'){
   const {data,error}=await db.from('garmin_equipment_profile').select('available,treadmill_max_incline_pct').eq('user_id',user.id).maybeSingle()
   if(error)return reply(503,{error:'Profil nicht abrufbar'})
   if(!data)return reply(200,{profile:null})
   const profile=validate({available:data.available,treadmillMaxInclinePct:data.treadmill_max_incline_pct})
   return profile?reply(200,{profile}):reply(503,{error:'Gespeichertes Profil ungültig'})
  }
  const raw=await req.text()
  if(raw.length>1500)return reply(413,{error:'Anfrage zu groß'})
  let input;try{input=JSON.parse(raw)}catch{return reply(422,{error:'Ungültiges JSON'})}
  if(!input||input.action!=='save'||input.confirm!==true)return reply(422,{error:'Bestätigung erforderlich'})
  const profile=validate(input.profile)
  if(!profile)return reply(422,{error:'Ausrüstungsprofil ungültig'})
  const {data,error:writeError}=await db.from('garmin_equipment_profile').upsert({user_id:user.id,available:profile.available,treadmill_max_incline_pct:profile.treadmillMaxInclinePct,updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('available,treadmill_max_incline_pct').single()
  if(writeError||!data)return reply(503,{error:'Profil konnte nicht gespeichert werden'})
  return reply(200,{saved:true,profile:{available:data.available,treadmillMaxInclinePct:data.treadmill_max_incline_pct},trainingPlanChanged:false})
 }catch{return reply(503,{error:'Profil derzeit nicht verfügbar'})}
})

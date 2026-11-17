/** Owner-only Intervals.icu WEIGHT bridge. Never claims Garmin Connect delivery.
 * Explicit single-date consent, local outbox verification, post-write readback.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
type WeightEntry={date:string;kg:number}
function validWeightEntry(data:unknown,todayMs=Date.now()):WeightEntry|null{
 if(!data||typeof data!=='object'||Array.isArray(data))return null
 const {date,kg}=data as Record<string,unknown>
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
 const d=new Date(date+'T00:00:00.000Z')
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null
 if(typeof kg!=='number'||!Number.isFinite(kg)||kg<30||kg>300||
  Math.abs(kg*100-Math.round(kg*100))>.00001)return null
 if(d.getTime()<todayMs-31*86400000||d.getTime()>todayMs+86400000)return null
 return {date,kg}
}

const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const allow=(origin:string)=>origin==='https://endurance-intelligence.github.io'||
 /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
const headers=(origin:string|null)=>({
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
 'X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'POST,OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 ...(origin&&allow(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})
})
const reply=(status:number,data:unknown,h:Record<string,string>)=>
 new Response(JSON.stringify(data),{status,headers:h})
function key(kind:'public'|'secret'){
 const env=kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
 try{const j=JSON.parse(Deno.env.get(env)||'{}');if(typeof j.default==='string'&&j.default)return j.default}catch{}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
async function remote(path:string,secret:string,method:'GET'|'PUT',body?:unknown){
 const control=new AbortController()
 const timeout=setTimeout(()=>control.abort(),10000)
 try{
  const res=await fetch('https://intervals.icu/api/v1'+path,{
   method,signal:control.signal,redirect:'error',cache:'no-store',
   headers:{Authorization:'Basic '+btoa('API_KEY:'+secret),Accept:'application/json',
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  })
  if(!res.ok)throw Error('Intervals HTTP '+res.status)
  return await res.json().catch(()=>null)
 }finally{clearTimeout(timeout)}
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!allow(origin))return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='POST')return reply(405,{error:'Nur ausdrückliche Einzelübertragung erlaubt'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Gewichtsübertragung nicht eingerichtet'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Bitte anmelden'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await auth.auth.getUser(bearer[1])
  if(authError||!user)return reply(401,{error:'Ungültige Anmeldung'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return reply(403,{error:'Nicht berechtigt'},h)
  const text=await req.text()
  if(text.length>512)return reply(413,{error:'Zu große Anfrage'},h)
  let body:unknown
  try{body=JSON.parse(text)}catch{return reply(422,{error:'Ungültige Gewichtseingabe'},h)}
  const entry=validWeightEntry(body)
  if(!entry)return reply(422,{error:'Ungültiges Datum oder Gewicht'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:weight,error:weightError}=await db.from('garmin_weight_outbox')
   .select('weigh_date,weight_kg,intervals_sync_status')
   .eq('weigh_date',entry.date).maybeSingle()
  if(weightError||!weight)return reply(409,{error:'Gewicht muss zuerst in GARMIN_AI gespeichert werden'},h)
  if(Math.abs(Number(weight.weight_kg)-entry.kg)>.005)
   return reply(409,{error:'Gewicht wurde geändert, bitte erneut speichern'},h)
  if(weight.intervals_sync_status==='confirmed')
   return reply(200,{saved:true,intervalsConfirmed:true,alreadyConfirmed:true,
    garminUpdated:false,date:entry.date,kg:entry.kg},h)
  const {data:linked,error:linkedError}=await db.from('garmin_intervals_connection')
   .select('connected_at').eq('user_id',user.id).maybeSingle()
  if(linkedError||!linked)return reply(409,{error:'Intervals.icu bitte zuerst in den Einstellungen verbinden'},h)
  const {data:secret,error:secretError}=await db.rpc('garmin_intervals_key_get',{p_user_id:user.id})
  if(secretError||typeof secret!=='string'||!secret)
   return reply(503,{error:'Intervals.icu-Zugang momentan nicht verfügbar'},h)
  const day=encodeURIComponent(entry.date)
  let verified=false
  try{
   // localDate updates Intervals' current athlete weight if it matches today.
   await remote('/athlete/0/wellness/'+day+'?localDate='+day,secret,'PUT',{weight:entry.kg})
   const checked=await remote('/athlete/0/wellness/'+day,secret,'GET')
   verified=checked&&typeof checked==='object'&&
     Math.abs(Number((checked as Record<string,unknown>).weight)-entry.kg)<.005
  }catch(e){
   console.error('Intervals weight delivery failed:',e instanceof Error?e.message:'unknown')
  }
  const status=verified?'confirmed':'needs_review'
  const {data:saved,error:saveError}=await db.from('garmin_weight_outbox')
   .update({intervals_sync_status:status,
    intervals_synced_at:verified?new Date().toISOString():null,
    updated_at:new Date().toISOString()})
   .eq('weigh_date',entry.date).eq('weight_kg',entry.kg)
   .select('weigh_date,intervals_sync_status').maybeSingle()
  if(saveError||!saved)return reply(409,{error:'Gewicht wurde möglicherweise geändert – Status prüfen',
   garminUpdated:false},h)
  if(!verified)return reply(502,{error:'Intervals.icu-Gewicht nicht durch Rücklesen bestätigt. Lokaler Wert bleibt gespeichert.',
   intervalsConfirmed:false,garminUpdated:false},h)
  return reply(200,{saved:true,intervalsConfirmed:true,
   garminUpdated:false,date:entry.date,kg:entry.kg},h)
 }catch(e){
  console.error('Private weight bridge failed:',e instanceof Error?e.message:'unknown')
  return reply(502,{error:'Gewichtsübertragung momentan nicht verfügbar'},h)
 }
})

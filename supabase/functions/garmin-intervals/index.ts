/**
 * GARMIN_AI v0.9.24 – Intervals.icu -> Garmin workout bridge.
 * Adapted from Endurance Intelligence's Intervals.icu publishing strategy.
 * No private Garmin OAuth, no direct Garmin writes and NO automatic publishing.
 * Only a reviewed, individually approved GARMIN_AI training plan may be sent.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {buildIntervalsEvent} from '../_shared/intervals-workout.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function key(mode:'public'|'secret'){
 const modern=mode==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
 try {
  const obj=JSON.parse(Deno.env.get(modern)||'{}')
  if(typeof obj.default==='string'&&obj.default)return obj.default
 }catch{/* support legacy keys */}
 return Deno.env.get(mode==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const isDev=(o:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(o)
const headers=(o:string|null)=>{
 const allowed=!!o&&(o==='https://endurance-intelligence.github.io'||isDev(o))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  ...(allowed?{'Access-Control-Allow-Origin':o!,'Vary':'Origin'}:{})}
}
const reply=(status:number,data:unknown,h:Record<string,string>)=>
 new Response(JSON.stringify(data),{status,headers:h})
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const today=()=>{
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=(k:string)=>p.find(x=>x.type===k)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
class RemoteError extends Error {
 status:number
 constructor(status:number){super('Intervals HTTP '+status);this.status=status}
}
async function intervals(method:string,path:string,apiKey:string,body?:unknown):Promise<unknown>{
 const control=new AbortController()
 const timer=setTimeout(()=>control.abort(),12000)
 try{
  const response=await fetch('https://intervals.icu/api/v1'+path,{
   method,cache:'no-store',redirect:'error',signal:control.signal,
   headers:{Authorization:'Basic '+btoa('API_KEY:'+apiKey),Accept:'application/json',
    ...(body!==undefined?{'Content-Type':'application/json'}:{})},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})
  })
  if(!response.ok)throw new RemoteError(response.status)
  return await response.json()
 }finally{clearTimeout(timer)}
}
const errorMessage=(e:unknown)=>{
 if(e instanceof RemoteError){
  if(e.status===401||e.status===403)return 'Intervals.icu hat den API-Key oder den Kalenderzugriff abgelehnt.'
  if(e.status===429)return 'Intervals.icu begrenzt Anfragen. Nicht wiederholt senden.'
  return 'Intervals.icu ist nicht erreichbar (HTTP '+e.status+').'
 }
 return 'Intervals.icu-Anfrage fehlgeschlagen. Bitte später prüfen.'
}
async function readEvents(apiKey:string,date:string):Promise<Record<string,unknown>[]>{
 const query=new URLSearchParams({oldest:date,newest:date})
 const result=await intervals('GET','/athlete/0/events?'+query.toString(),apiKey)
 if(!Array.isArray(result))throw Error('Unexpected event list')
 return result.filter(isObject)
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
   return reply(503,{error:'Private bridge not configured'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Sign in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await auth.auth.getUser(bearer[1])
  if(userError||!user)return reply(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
    return reply(403,{error:'Not authorized'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  if(req.method==='GET'){
   const [{data:link,error:linkError},{data:rows,error:rowsError},{data:eligible,error:eligibleError}]=await Promise.all([
    db.from('garmin_intervals_connection').select('connected_at').eq('user_id',user.id).maybeSingle(),
    db.from('garmin_training_plan')
     .select('id,revision,intervals_event_id,intervals_published_revision,intervals_published_at,intervals_sync_status')
     .not('intervals_published_revision','is',null).order('intervals_published_at',{ascending:false}).limit(100),
    db.from('garmin_training_plan').select('id').not('archive_workout_id','is',null).neq('state','cancelled').limit(100)
   ])
   if(linkError||rowsError||eligibleError)return reply(503,{error:'Intervals status unavailable'},h)
   return reply(200,{configured:!!link,connectedAt:link?.connected_at||null,
    publications:rows||[],eligiblePlanIds:(eligible||[]).map(x=>x.id),garminConfirmed:false},h)
  }
  const raw=await req.text()
  if(raw.length>16000)return reply(413,{error:'Request too large'},h)
  let input:unknown
  try{input=JSON.parse(raw)}catch{return reply(422,{error:'Invalid JSON'},h)}
  if(!isObject(input))return reply(422,{error:'Invalid request'},h)
  if(input.action==='connect'){
   const apiKey=typeof input.apiKey==='string'?input.apiKey.trim():''
   if(apiKey.length<12||apiKey.length>300||/\s/.test(apiKey))
     return reply(422,{error:'Ungültiges Intervals.icu API-Key-Format.'},h)
   try{await readEvents(apiKey,today())}
   catch(e){return reply(409,{error:errorMessage(e)},h)}
   const {data:stored,error:storageError}=await db.rpc('garmin_intervals_key_put',{
    p_user_id:user.id,p_api_key:apiKey
   })
   if(storageError||stored!==true)return reply(503,{error:'Sichere API-Key-Speicherung fehlgeschlagen'},h)
   return reply(200,{connected:true,stored:true,garminConfirmed:false},h)
  }
  if(input.action==='disconnect'){
   const {error:unlinkError}=await db.rpc('garmin_intervals_key_delete',{p_user_id:user.id})
   if(unlinkError)return reply(503,{error:'Trennung fehlgeschlagen'},h)
   return reply(200,{connected:false,remoteEventsRetained:true},h)
  }
  if(input.action!=='publish'||!uuid(input.planId))
    return reply(422,{error:'Unknown action or plan ID'},h)
  const {data:plan,error:planError}=await db.from('garmin_training_plan')
   .select('id,training_date,title,state,revision,approved_at,archive_snapshot,archive_group,intervals_published_revision,intervals_sync_status')
   .eq('id',input.planId).maybeSingle()
  if(planError||!plan)return reply(404,{error:'Workout not found'},h)
  if(plan.state!=='pending'||!plan.approved_at||!plan.archive_snapshot)
   return reply(409,{error:'Trainingsgruppe zuerst im GARMIN_AI Kalender freigeben.'},h)
  if(plan.training_date<today())return reply(409,{error:'Vergangene Trainings können nicht veröffentlicht werden.'},h)
  if(plan.intervals_published_revision===plan.revision&&plan.intervals_sync_status==='confirmed')
   return reply(200,{published:true,alreadyPublished:true,intervalsConfirmed:true,garminConfirmed:false},h)
  let event:Record<string,unknown>
  try{event=buildIntervalsEvent(plan)}
  catch{return reply(422,{error:'Trainingsstruktur ungültig oder mehr als 50 Schritte.'},h)}
  const {data:secret,error:secretError}=await db.rpc('garmin_intervals_key_get',{p_user_id:user.id})
  if(secretError||typeof secret!=='string'||!secret)
   return reply(409,{error:'Intervals.icu erst unter Einstellungen verbinden.'},h)
  const externalId=String(event.external_id)
  try{
   // Upsert with stable external_id is the Endurance Intelligence strategy.
   // It does not delete unrelated or old EI training calendar events.
   const existing=await readEvents(secret,plan.training_date)
   let found=existing.find(x=>x.external_id===externalId)
   if(!found||found.description!==event.description||found.category!=='WORKOUT'){
    const result=await intervals('POST','/athlete/0/events/bulk?upsert=true',secret,[event])
    if(!Array.isArray(result)||!result.length)throw Error('Unexpected Intervals response')
    // Confirm by fetching the event back; never claim Garmin delivered it.
    const check=await readEvents(secret,plan.training_date)
    found=check.find(x=>x.external_id===externalId)
   }
   const count=(String(found?.description||'').match(/intensity=/g)||[]).length
   const expected=(String(event.description).match(/intensity=/g)||[]).length
   if(!found||found.category!=='WORKOUT'||String(found.type).toLowerCase()!=='run'||
      count<expected||!Number.isSafeInteger(Number(found.id))){
    await db.from('garmin_training_plan').update({intervals_sync_status:'needs_review'})
      .eq('id',plan.id).eq('revision',plan.revision)
    return reply(409,{error:'Intervals.icu konnte nicht vollständig bestätigt werden. Bitte dort prüfen – kein automatischer Wiederholungsversuch.'},h)
   }
   const {data:saved,error:saveError}=await db.from('garmin_training_plan')
    .update({intervals_sync_status:'confirmed',intervals_event_id:Number(found.id),
      intervals_published_revision:plan.revision,intervals_published_at:new Date().toISOString()})
    .eq('id',plan.id).eq('revision',plan.revision).eq('state','pending')
    .select('id').maybeSingle()
   if(saveError||!saved)return reply(409,{error:'Intervals.icu wurde aktualisiert, GARMIN_AI-Bestätigung benötigt Prüfung.'},h)
   return reply(200,{published:true,intervalsConfirmed:true,garminConfirmed:false,
    intervalsEventId:found.id,date:plan.training_date})
  }catch(e){
   // Do not automatically retry remote writes (even on timeouts).
   await db.from('garmin_training_plan').update({intervals_sync_status:'needs_review'})
    .eq('id',plan.id).eq('revision',plan.revision)
   return reply(502,{error:errorMessage(e)+' Status bei Intervals.icu prüfen, bevor du erneut sendest.'},h)
  }
 }catch{
  return reply(503,{error:'Private Intervals.icu bridge unavailable'},h)
 }
})

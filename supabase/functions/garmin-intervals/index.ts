/**
 * GARMIN_AI v0.9.24 – Intervals.icu -> Garmin workout bridge.
 * Adapted from Endurance Intelligence's Intervals.icu publishing strategy.
 * No private Garmin OAuth, no direct Garmin writes and NO automatic publishing.
 * Only a reviewed, individually approved GARMIN_AI training plan may be sent.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {buildIntervalsEvent,validateStoredIntervalsWorkout} from '../_shared/intervals-workout.mjs'

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
  const text=await response.text()
  return text?JSON.parse(text):null
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
async function fullEvent(apiKey:string,id:unknown):Promise<Record<string,unknown>>{
 if(!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('Invalid remote event identifier')
 const item=await intervals('GET','/athlete/0/events/'+Number(id),apiKey)
 if(!isObject(item))throw Error('Invalid Intervals event response')
 return item
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
     .select('id,revision,intervals_event_id,intervals_published_revision,intervals_published_at,intervals_sync_status,intervals_export_version')
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
  if(input.action==='delete_published'){
   // No blind deletes. Only the user's specific already-published GARMIN_AI event.
   if(!uuid(input.planId)||input.acknowledge!==true||
      !Number.isSafeInteger(input.revision)||Number(input.revision)<1)
    return reply(422,{error:'Trainingslöschung muss ausdrücklich bestätigt werden.'},h)
   const {data:plan,error:planError}=await db.from('garmin_training_plan')
    .select('id,state,revision,intervals_event_id,intervals_published_revision')
    .eq('id',input.planId).maybeSingle()
   if(planError||!plan)return reply(404,{error:'Training nicht gefunden'},h)
   if(plan.revision!==input.revision||
      !['draft','pending','needs_review'].includes(plan.state)||
      !Number.isSafeInteger(Number(plan.intervals_event_id))||
      Number(plan.intervals_event_id)<1)
    return reply(409,{error:'Training wurde inzwischen geändert oder ist nicht bei Intervals.icu veröffentlicht.'},h)
   const {data:secret,error:secretError}=await db.rpc('garmin_intervals_key_get',{p_user_id:user.id})
   if(secretError||typeof secret!=='string'||!secret)
    return reply(409,{error:'Intervals.icu ist nicht verbunden. Bitte den bestehenden Eintrag dort prüfen.'},h)
   try{
    const existing=await fullEvent(secret,plan.intervals_event_id)
    const externalId='garmin-ai:'+plan.id
    if(existing.external_id!==externalId||
       Number(existing.id)!==Number(plan.intervals_event_id)||
       existing.category!=='WORKOUT')
     return reply(409,{error:'Der externe Termin gehört nicht eindeutig zu GARMIN_AI. Nichts gelöscht.'},h)
    await intervals('DELETE','/athlete/0/events/'+Number(plan.intervals_event_id),secret)
    // Remote deletion completed; local cancellation is optimistic, never
    // delete actual Garmin activities or another application's event.
    const {data:saved,error:saveError}=await db.from('garmin_training_plan')
     .update({state:'cancelled',revision:plan.revision+1,
      intervals_event_id:null,intervals_published_revision:null,
      intervals_sync_status:'not_published',updated_at:new Date().toISOString()})
     .eq('id',plan.id).eq('revision',plan.revision)
     .in('state',['draft','pending','needs_review'])
     .select('id,revision,state').maybeSingle()
    if(saveError||!saved)return reply(409,{
     error:'Der Intervals.icu-Termin ist entfernt, aber der lokale Status muss geprüft werden. Bitte nicht erneut löschen.',
     remoteRemoved:true
    },h)
    return reply(200,{saved:true,remoteRemoved:true,garminActivityDeleted:false,
     garminConnectScheduleDeletionUnverified:true,...saved},h)
   }catch(e){
    return reply(502,{error:errorMessage(e)+
     ' Bitte Intervals.icu prüfen, bevor du den Löschvorgang wiederholst.'},h)
   }
  }
  if(!['publish','repair'].includes(String(input.action))||!uuid(input.planId))
    return reply(422,{error:'Unknown action or plan ID'},h)
  const {data:plan,error:planError}=await db.from('garmin_training_plan')
   .select('id,training_date,title,state,revision,approved_at,archive_snapshot,archive_group,intervals_event_id,intervals_published_revision,intervals_sync_status,intervals_export_version')
   .eq('id',input.planId).maybeSingle()
  if(planError||!plan)return reply(404,{error:'Workout not found'},h)
  if(plan.state!=='pending'||!plan.approved_at||!plan.archive_snapshot)
   return reply(409,{error:'Trainingsgruppe zuerst im GARMIN_AI Kalender freigeben.'},h)
  const repairing=input.action==='repair'
  if(!repairing&&plan.training_date<today())return reply(409,{error:'Vergangene Trainings können nicht veröffentlicht werden.'},h)
  if(repairing){
   // Repair a single already approved event, never create a duplicate or touch EI events.
   const minDay=new Date(Date.now()-31*86400000).toISOString().slice(0,10)
   if(input.acknowledge!==true||plan.training_date<minDay||
      plan.intervals_published_revision!==plan.revision||
      !Number.isSafeInteger(Number(plan.intervals_event_id))||Number(plan.intervals_event_id)<1||
      plan.intervals_export_version>=2)
    return reply(409,{error:'Nur der ausdrücklich bestätigte, bisher fehlerhafte Export darf korrigiert werden.'},h)
  }else if(plan.intervals_published_revision===plan.revision){
   if(plan.intervals_export_version>=2&&plan.intervals_sync_status==='confirmed')
    return reply(200,{published:true,alreadyPublished:true,intervalsConfirmed:true,garminConfirmed:false},h)
   return reply(409,{error:'Vorhandenes Training benötigt die ausdrücklich bestätigte Export-Korrektur.'},h)
  }
  let event:Record<string,unknown>
  try{event=buildIntervalsEvent(plan)}
  catch{return reply(422,{error:'Trainingsstruktur ungültig oder mehr als 50 Schritte.'},h)}
  const {data:secret,error:secretError}=await db.rpc('garmin_intervals_key_get',{p_user_id:user.id})
  if(secretError||typeof secret!=='string'||!secret)
   return reply(409,{error:'Intervals.icu erst unter Einstellungen verbinden.'},h)
  const externalId=String(event.external_id)
  try{
   // Repair may only update the exact pre-existing event ID and external_id.
   let oldEvent:Record<string,unknown>|null=null
   if(repairing){
    oldEvent=await fullEvent(secret,plan.intervals_event_id)
    if(oldEvent.external_id!==externalId||Number(oldEvent.id)!==Number(plan.intervals_event_id))
     return reply(409,{error:'Der gespeicherte Intervals-Termin gehört nicht eindeutig zu diesem GARMIN_AI-Training.'},h)
   }
   const existing=repairing?[oldEvent!]:await readEvents(secret,plan.training_date)
   let found=existing.find(x=>x.external_id===externalId)
   // One remote write only, initiated by the user's direct button click.
   if(repairing){
    await intervals('PUT','/athlete/0/events/'+Number(plan.intervals_event_id),secret,{
     ...event,id:Number(plan.intervals_event_id)
    })
    found=await fullEvent(secret,plan.intervals_event_id)
   }else if(!found||found.description!==event.description||found.category!=='WORKOUT'){
    const created=await intervals('POST','/athlete/0/events/bulk?upsert=true',secret,[event])
    if(!Array.isArray(created)||!created.length)throw Error('Unexpected Intervals response')
    const list=await readEvents(secret,plan.training_date)
    found=list.find(x=>x.external_id===externalId)
   }
   if(found?.id)found=await fullEvent(secret,found.id)
   const review=validateStoredIntervalsWorkout(found,plan.archive_snapshot,event)
   if(!review.ok){
    await db.from('garmin_training_plan').update({intervals_sync_status:'needs_review'})
      .eq('id',plan.id).eq('revision',plan.revision)
    return reply(409,{error:'Intervals.icu hat das Training nicht korrekt interpretiert: '+review.reason+'. Bitte nicht auf der Uhr starten.',verified:false},h)
   }
   const {data:saved,error:saveError}=await db.from('garmin_training_plan')
    .update({intervals_sync_status:'confirmed',intervals_event_id:Number(found!.id),
      intervals_published_revision:plan.revision,intervals_export_version:2,
      intervals_published_at:new Date().toISOString()})
    .eq('id',plan.id).eq('revision',plan.revision).eq('state','pending')
    .select('id').maybeSingle()
   if(saveError||!saved)return reply(409,{error:'Intervals.icu wurde aktualisiert, GARMIN_AI-Bestätigung benötigt Prüfung.'},h)
   return reply(200,{published:true,intervalsConfirmed:true,garminConfirmed:false,
    validatedStructure:true,repair:repairing,intervalsEventId:found!.id,date:plan.training_date})
  }catch(e){
   await db.from('garmin_training_plan').update({intervals_sync_status:'needs_review'})
    .eq('id',plan.id).eq('revision',plan.revision)
   return reply(502,{error:errorMessage(e)+' Status bei Intervals.icu prüfen, bevor du erneut sendest.'},h)
  }
 }catch{
  return reply(503,{error:'Private Intervals.icu bridge unavailable'},h)
 }
})

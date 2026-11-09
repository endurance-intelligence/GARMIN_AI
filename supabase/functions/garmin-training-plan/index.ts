/**
 * GARMIN_AI v0.9.4 – owner-only coach training plan / Garmin calendar outbox.
 * Explicit user approval is required for every planned Garmin write.
 * No Garmin OAuth tokens or Garmin API calls exist in this Edge function.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function envKey(kind:'public'|'service'){
  const modern=kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
  const legacy=kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const obj=JSON.parse(Deno.env.get(modern)||'{}') as Record<string,unknown>
    if(typeof obj.default==='string'&&obj.default)return obj.default
  }catch {/* legacy key fallback */}
  return Deno.env.get(legacy)||''
}
function response(status:number,body:unknown,h:Record<string,string>){
 return new Response(JSON.stringify(body),{status,headers:h})
}
function headers(origin:string|null):Record<string,string>{
 const allowed=origin==='https://endurance-intelligence.github.io'||
   (!!origin&&/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin))
 return {
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  ...(allowed&&origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})
 }
}
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const date=(v:unknown):v is string=>typeof v==='string'&&
 /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&
 new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v
const fields='id,training_date,title,session_type,sport,garmin_workout_id,notes,state,revision,approved_at,confirmed_at,garmin_remote_id,created_at,updated_at'

Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return response(403,{error:'Origin forbidden'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return response(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!envKey('public')||!envKey('service'))
   return response(503,{error:'Private calendar not configured'},h)
 const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!match)return response(401,{error:'Login required'},h)
 try{
  const auth=createClient(project,envKey('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(match[1])
  if(error||!user)return response(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
    return response(403,{error:'Not authorized'},h)
  const db=createClient(project,envKey('service'),{auth:{persistSession:false,autoRefreshToken:false}})
  if(req.method==='GET'){
    const now=new Date()
    const since=new Date(now.getTime()-30*86400000).toISOString().slice(0,10)
    const {data:rows,error:readError}=await db.from('garmin_training_plan')
      .select(fields).gte('training_date',since)
      .order('training_date',{ascending:true}).limit(180)
    if(readError)return response(503,{error:'Calendar unavailable'},h)
    return response(200,{entries:rows||[],garminWritesActive:false},h)
  }
  if(Number(req.headers.get('content-length')||0)>1500)
    return response(413,{error:'Request too large'},h)
  const body=await req.text()
  if(body.length>1500)return response(413,{error:'Request too large'},h)
  let input:unknown
  try{input=JSON.parse(body)}catch{return response(422,{error:'Invalid JSON'},h)}
  if(!plain(input))return response(422,{error:'Invalid request'},h)
  if(input.action==='create'){
    if(!uuid(input.clientRequestId)||!date(input.date)||
       typeof input.title!=='string'||input.title.trim().length<1||
       input.title.length>120||!['workout','event'].includes(String(input.sessionType))||
       !['running','cycling','strength','other','rest'].includes(String(input.sport))||
       (input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>500)))
      return response(422,{error:'Invalid planned training'},h)
    const kind=String(input.sessionType)
    const workoutId=input.garminWorkoutId
    if((kind==='workout'&&
      !(typeof workoutId==='number'&&Number.isSafeInteger(workoutId)&&workoutId>0))||
      (kind==='event'&&workoutId!=null))
      return response(422,{error:'Invalid workout reference'},h)
    const today=new Date().toISOString().slice(0,10)
    const horizon=new Date(Date.now()+400*86400000).toISOString().slice(0,10)
    if(input.date<today||input.date>horizon)
      return response(422,{error:'Training date is outside planning window'},h)
    const row={
      client_request_id:input.clientRequestId,training_date:input.date,
      title:input.title.trim(),session_type:kind,sport:input.sport,
      garmin_workout_id:kind==='workout'?workoutId:null,
      notes:input.notes||'',state:'draft'
    }
    const {data:existing,error:existingError}=await db.from('garmin_training_plan')
      .select('id,training_date,title,session_type,sport,garmin_workout_id,notes,state,revision')
      .eq('client_request_id',input.clientRequestId).maybeSingle()
    if(existingError)return response(503,{error:'Calendar read unavailable'},h)
    if(existing){
      const same=existing.training_date===row.training_date&&existing.title===row.title&&
       existing.session_type===row.session_type&&existing.sport===row.sport&&
       existing.garmin_workout_id===row.garmin_workout_id&&existing.notes===row.notes
      if(!same)return response(409,{error:'Request ID used for different training'},h)
      return response(200,{saved:true,created:false,id:existing.id,
        revision:existing.revision,state:existing.state,garminUpdated:false},h)
    }
    const {data:saved,error:saveError}=await db.from('garmin_training_plan')
      .insert(row).select('id,revision,state').single()
    if(saveError)return response(409,{error:'Could not create training draft'},h)
    return response(201,{saved:true,created:true,...saved,garminUpdated:false},h)
  }
  if(input.action==='approve'||input.action==='cancel'){
    if(!uuid(input.id)||!Number.isSafeInteger(input.revision)||
      Number(input.revision)<1)
      return response(422,{error:'Invalid training revision'},h)
    const approving=input.action==='approve'
    const changes=approving?
      {state:'pending',approved_at:new Date().toISOString(),
       revision:Number(input.revision)+1,updated_at:new Date().toISOString()}:
      {state:'cancelled',revision:Number(input.revision)+1,
       updated_at:new Date().toISOString()}
    let query=db.from('garmin_training_plan').update(changes)
      .eq('id',input.id).eq('revision',input.revision)
    if(approving)query=query.eq('state','draft')
    else query=query.in('state',['draft','pending','needs_review'])
    const {data:saved,error:saveError}=await query.select('id,revision,state').maybeSingle()
    if(saveError||!saved)
      return response(409,{error:'Training state changed or approval not allowed'},h)
    return response(200,{saved:true,...saved,garminUpdated:false},h)
  }
  return response(422,{error:'Unknown training action'},h)
 }catch{
  return response(503,{error:'Private calendar temporarily unavailable'},h)
 }
})

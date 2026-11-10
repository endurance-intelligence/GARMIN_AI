/** GARMIN_AI v0.9.13: owner-only trainer workout archive, manual approval.
 * Remote vision parse is optional and NEVER persists unreviewed prescriptions.
 * No Garmin write operations, OAuth access, or secret values leave this worker.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {validateTrainerWorkout} from '../_shared/workout-archive-schema.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const allowedOrigins=new Set(['https://endurance-intelligence.github.io'])
const isDevOrigin=(o:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(o)
const headers=(origin:string|null)=>{
 const ok=origin&&(allowedOrigins.has(origin)||isDevOrigin(origin))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  ...(ok?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const respond=(n:number,b:unknown,h:Record<string,string>)=>
 new Response(JSON.stringify(b),{status:n,headers:h})
function key(kind:'public'|'service'){
 try{
  const data=JSON.parse(Deno.env.get(kind==='public'?
    'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}') as Record<string,unknown>
  if(typeof data.default==='string'&&data.default)return data.default
 }catch{/* injected legacy key */ }
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const day=(v:unknown):v is string=>typeof v==='string'&&
 /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&
 new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v
const plain=(v:unknown):v is Record<string,unknown>=>
 !!v&&typeof v==='object'&&!Array.isArray(v)
const sha=(v:unknown)=>v===null||v===undefined||
 (typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))
const visionAvailable=()=>!!Deno.env.get('OPENAI_API_KEY')

const stepSchema={
 type:'object',additionalProperties:false,
 required:['kind','distanceMeters','durationSeconds','paceSecondsPerKm','notes'],
 properties:{
  kind:{type:'string',enum:['run','recovery','drill','warmup','cooldown']},
  distanceMeters:{type:['integer','null']},
  durationSeconds:{type:['integer','null']},
  paceSecondsPerKm:{type:['integer','null']},
  notes:{type:'string'}
 }
}
const shortSchema={
 type:'object',additionalProperties:false,
 required:['distanceMeters','durationSeconds','notes'],
 properties:{
  distanceMeters:{type:['integer','null']},
  durationSeconds:{type:['integer','null']},
  notes:{type:'string'}
 }
}
const outputSchema={
 type:'object',additionalProperties:false,
 required:['version','title','trainer','sourceLabel','warmup','cooldown','groups'],
 properties:{
  version:{type:'integer',enum:[1]},title:{type:'string'},
  trainer:{type:'string'},sourceLabel:{type:'string'},
  warmup:shortSchema,cooldown:shortSchema,
  groups:{type:'array',items:{
   type:'object',additionalProperties:false,
   required:['name','notes','steps'],
   properties:{name:{type:'string'},notes:{type:'string'},
    steps:{type:'array',items:stepSchema}}
  }}
 }
}
async function parsePhoto(input:Record<string,unknown>){
 const image=input.image
 if(typeof image!=='string'||image.length>3_600_000||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image))
   return {code:'invalid_image'}
 const encoded=image.slice(image.indexOf(',')+1)
 let bin:Uint8Array
 try{bin=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))}
 catch{return {code:'invalid_image'}}
 if(bin.length<1500||bin.length>2_700_000)return {code:'invalid_image'}
 const digest=await crypto.subtle.digest('SHA-256',bin)
 const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')
 const secret=Deno.env.get('OPENAI_API_KEY')
 if(!secret)return {code:'vision_not_configured'}
 const prompt=[
  'Extract a TRAINING POSTER into a precise running workout. You are a careful transcriber.',
  'Return all distinct groups shown in the image with their own exact sequence.',
  'For interval blocks expand each interval and each between-interval jog recovery explicitly.',
  'Preserve every distance, time, pace and order from the trainer flyer.',
  'Paces are whole seconds per kilometer. E.g. 4:20 min/km -> 260.',
  'For any ambiguity, do NOT guess; mark uncertainty in group/step notes and set unknown pace/distance to null.',
  'Record training coach only if visibly identifiable. Group name is not the coach name.',
  'Keep any Miniband/drill without a time as a drill step. Separate warmup and cooldown.',
  'If a poster contains too many steps or is illegible, return no groups.',
  'Do not invent or prescribe any training not visible in the source.'
 ].join(' ')
 const controller=new AbortController()
 const timeout=setTimeout(()=>controller.abort(),45000)
 try{
  const response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',signal:controller.signal,
   headers:{authorization:'Bearer '+secret,'content-type':'application/json'},
   body:JSON.stringify({
    model:Deno.env.get('OPENAI_WORKOUT_PARSE_MODEL')||'gpt-4.1-mini',
    store:false,max_output_tokens:8200,
    input:[{role:'user',content:[
     {type:'input_text',text:prompt},
     {type:'input_image',image_url:image,detail:'high'}
    ]}],
    text:{format:{type:'json_schema',name:'trainer_workout_poster',
      strict:true,schema:outputSchema}}
   })
  })
  if(!response.ok){
   // Never return or log OpenAI's raw error body, credentials or image.
   // Only allowlisted provider error codes and HTTP status are retained.
   let providerCode=''
   try{
    const body=await response.json() as {error?:{code?:unknown}}
    const possible=body?.error?.code
    if(typeof possible==='string'&&['insufficient_quota','billing_hard_limit_reached',
      'model_not_found'].includes(possible))providerCode=possible
   }catch{/* Non-JSON upstream error: status is sufficient. */}
   const code=response.status===401||response.status===403?'vision_credentials_rejected':
    response.status===429&&['insufficient_quota','billing_hard_limit_reached'].includes(providerCode)?
     'vision_quota_exceeded':
    response.status===429?'vision_rate_limited':
    response.status===404||providerCode==='model_not_found'?'vision_model_unavailable':
    response.status===400||response.status===422?'vision_request_rejected':
    'vision_upstream_unavailable'
   console.info('GARMIN_AI photo parser outcome',code,'upstream HTTP',response.status)
   return {code,upstreamStatus:response.status}
  }
  const result=await response.json()
  const raw=result?.output_text||
   result?.output?.flatMap((r:Record<string,unknown>)=>Array.isArray(r.content)?r.content:[])
    ?.find((c:Record<string,unknown>)=>c.type==='output_text')?.text
  if(typeof raw!=='string'||raw.length>55000){
   const code=result?.status==='incomplete'?'vision_output_truncated':'vision_incomplete'
   console.info('GARMIN_AI photo parser outcome',code)
   return {code}
  }
  let json:unknown
  try{json=JSON.parse(raw)}catch{
   console.info('GARMIN_AI photo parser outcome vision_invalid_output')
   return {code:'vision_invalid_output'}
  }
  const validated=validateTrainerWorkout(json)
  if(!validated){
   console.info('GARMIN_AI photo parser outcome vision_needs_manual_review')
   return {code:'vision_needs_manual_review'}
  }
  return {code:'parsed',workout:validated,sourceImageSha256:hash}
 }catch(e){
  const code=e instanceof Error&&e.name==='AbortError'?'vision_timeout':
   'vision_upstream_unavailable'
  console.info('GARMIN_AI photo parser outcome',code)
  return {code}
 }
 finally{clearTimeout(timeout)}
}

Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])
   return respond(403,{error:'Origin forbidden'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return respond(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('service'))
   return respond(503,{error:'Private archive not configured'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return respond(401,{error:'Login required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return respond(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return respond(403,{error:'Not authorized'},h)
  const db=createClient(project,key('service'),{auth:{persistSession:false,autoRefreshToken:false}})

  if(req.method==='GET'){
   const page=new URL(req.url).searchParams.get('page')||'0'
   if(!/^(0|[1-9][0-9]{0,2})$/.test(page)||Number(page)>50)
    return respond(422,{error:'Invalid archive page'},h)
   const offset=Number(page)*100
   const {data,error}=await db.from('garmin_workout_archive')
    .select('id,title,coach_name,source_label,source_kind,source_image_sha256,workout,created_at')
    .order('created_at',{ascending:false}).order('id',{ascending:false})
    .range(offset,offset+100)
   if(error)return respond(503,{error:'Training archive unavailable'},h)
   return respond(200,{entries:(data||[]).slice(0,100),hasMore:(data||[]).length>100,
    nextPage:(data||[]).length>100?Number(page)+1:null,
    visionConfigured:visionAvailable(),garminWritesActive:false},h)
  }
  if(Number(req.headers.get('content-length')||0)>3_750_000)
   return respond(413,{error:'Request too large'},h)
  const text=await req.text()
  if(text.length>3_750_000)return respond(413,{error:'Request too large'},h)
  let body:unknown
  try{body=JSON.parse(text)}catch{return respond(422,{error:'Invalid JSON'},h)}
  if(!plain(body))return respond(422,{error:'Invalid request'},h)
  if(body.action==='parse_photo'){
   if(!visionAvailable())return respond(503,{code:'vision_not_configured'},h)
   const parsed=await parsePhoto(body)
   const status=parsed.code==='parsed'?200:
    parsed.code==='vision_rate_limited'?429:
    parsed.code==='vision_quota_exceeded'?503:
    parsed.code==='vision_credentials_rejected'?503:
    parsed.code==='vision_model_unavailable'?503:
    parsed.code==='vision_timeout'?504:
    parsed.code==='vision_upstream_unavailable'?503:422
   return respond(status,parsed,h)
  }
  if(body.action==='save'){
   const verified=validateTrainerWorkout(body.workout)
   if(!uuid(body.clientRequestId)||body.reviewed!==true||!verified||
      !['trainer_photo','manual','orc_reference'].includes(String(body.sourceKind))||
      !sha(body.sourceImageSha256)||
      (body.sourceKind==='trainer_photo'&&
       !/^[a-f0-9]{64}$/.test(String(body.sourceImageSha256||''))))
    return respond(422,{error:'Review all trainer workout fields first'},h)
   const row={
    client_request_id:body.clientRequestId,title:verified.title,
    coach_name:verified.trainer,source_label:verified.sourceLabel,
    source_kind:body.sourceKind,source_image_sha256:body.sourceImageSha256||null,
    workout:verified
   }
   const {data:found,error:readError}=await db.from('garmin_workout_archive')
    .select('id,title,coach_name,source_label,source_kind,source_image_sha256,workout')
    .eq('client_request_id',body.clientRequestId).maybeSingle()
   if(readError)return respond(503,{error:'Archive unavailable'},h)
   if(found){
    const same=found.title===row.title&&found.coach_name===row.coach_name&&
     found.source_label===row.source_label&&found.source_kind===row.source_kind&&
     found.source_image_sha256===row.source_image_sha256&&
     JSON.stringify(found.workout)===JSON.stringify(row.workout)
    return same?respond(200,{saved:true,created:false,id:found.id},h):
     respond(409,{error:'Request ID already used for another workout'},h)
   }
   const {data:saved,error:saveError}=await db.from('garmin_workout_archive')
    .insert(row).select('id').single()
   if(saveError)return respond(409,{error:'Could not save workout'},h)
   return respond(201,{saved:true,created:true,id:saved.id,garminUpdated:false},h)
  }
  if(body.action==='plan'){
   if(!uuid(body.templateId)||!uuid(body.clientRequestId)||!day(body.date)||
      typeof body.group!=='string'||body.group.length<1||body.group.length>50)
    return respond(422,{error:'Invalid calendar request'},h)
   const {data,error}=await db.rpc('garmin_workout_archive_plan',{
    p_template_id:body.templateId,p_group:body.group,
    p_day:body.date,p_request_id:body.clientRequestId
   })
   if(error)return respond(503,{error:'Archive calendar action unavailable'},h)
   return respond(data?.saved?200:409,{...data,garminUpdated:false},h)
  }
  return respond(422,{error:'Unknown archive action'},h)
 }catch{return respond(503,{error:'Private workout archive temporarily unavailable'},h)}
})

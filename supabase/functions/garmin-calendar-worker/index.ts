/** GARMIN_AI v0.9.5 – manual-only OIDC calendar delivery bridge.
 * No browser access, no Supabase service role credentials in GitHub.
 * Hardcoded production write lock; separate reviewed release required.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@5.9.6'
import {isGarminCloudSession} from '../_shared/garmin-connect-tokens.mjs'
import {trustedCalendarWorkflowClaims} from '../_shared/garmin-calendar-worker-claims.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const audience='garmin-ai-calendar:eurgupsebxypjqvyizci'
const keys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'))
const h={'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:h})
function serviceKey(){
 try{
  const obj=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}') as Record<string,unknown>
  if(typeof obj.default==='string'&&obj.default)return obj.default
 }catch{ /* legacy fallback */ }
 return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}
const LIVE_WRITES_RELEASED=false
const enabled=()=>LIVE_WRITES_RELEASED&&Deno.env.get('GARMIN_CALENDAR_WRITES_ENABLED')==='true'
const validUuid=(v:unknown):v is string=>typeof v==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const validDate=(v:unknown):v is string=>typeof v==='string'&&
 /^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+'T12:00:00Z'))&&
 new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v
const validId=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0
const validRemote=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)

Deno.serve(async req=>{
 if(req.headers.has('origin'))return reply(403,{error:'No browser access'})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'})
 if(Deno.env.get('SUPABASE_URL')!==project||!serviceKey())
  return reply(503,{error:'Private calendar gateway unavailable'})
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Signed workflow identity required'})
 try{
  const {payload}=await jwtVerify(bearer[1],keys,{
   issuer:'https://token.actions.githubusercontent.com',
   audience,algorithms:['RS256'],clockTolerance:5
  })
  if(!trustedCalendarWorkflowClaims(payload))
   return reply(403,{error:'Untrusted calendar workflow'})
 }catch{return reply(401,{error:'Invalid GitHub workflow identity'})}

 const db=createClient(project,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}})
 const writeAuthorized=enabled()&&req.headers.get('x-garmin-calendar-active')==='true'
 if(req.method==='GET'){
  const {data:pending,error}=await db.rpc('garmin_calendar_next_pending')
  if(error||!pending)return reply(503,{error:'Calendar queue unavailable'})
  if(!writeAuthorized)return reply(200,{mode:'dry-run',writerEnabled:false,
   pendingAvailable:pending.available===true})
  if(pending.available!==true)return reply(200,{mode:'enabled',writerEnabled:true,pendingAvailable:false})
  const {data:guard,error:guardError}=await db.rpc('garmin_cloud_auth_guard_state')
  if(guardError||!guard)return reply(503,{error:'Garmin OAuth cooldown state unavailable'})
  if(guard.allowed!==true)return reply(429,{error:'Garmin OAuth cooldown active'})
  const {data:session,error:sessionError}=await db.rpc('garmin_connect_session_get')
  if(sessionError||!session?.connected||
     !Number.isSafeInteger(session.version)||!isGarminCloudSession(session.tokens))
   return reply(503,{error:'Private Garmin OAuth unavailable'})
  return reply(200,{mode:'enabled',writerEnabled:true,pendingAvailable:true,
    pending,version:session.version,tokens:session.tokens})
 }
 if(!writeAuthorized)return reply(403,{error:'Garmin calendar writes disabled'})
 if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
  return reply(415,{error:'JSON required'})
 if(Number(req.headers.get('content-length')||0)>23000)return reply(413,{error:'Payload too large'})
 const body=await req.text()
 if(body.length>23000)return reply(413,{error:'Payload too large'})
 let value:unknown
 try{value=JSON.parse(body)}catch{return reply(422,{error:'Invalid JSON'})}
 if(!value||typeof value!=='object'||Array.isArray(value))return reply(422,{error:'Invalid request'})
 const v=value as Record<string,unknown>
 let fn:string,args:Record<string,unknown>
 switch(v.action){
  case 'claim':
   if(!validUuid(v.id)||!validId(v.revision)||!validDate(v.date)||!validId(v.workoutId))
    return reply(422,{error:'Invalid calendar claim'})
   fn='garmin_calendar_claim'
   args={p_id:v.id,p_revision:v.revision,p_date:v.date,p_workout_id:v.workoutId}
   break
  case 'confirm-existing':
   if(!validUuid(v.id)||!validId(v.revision)||!validDate(v.date)||
      !validId(v.workoutId)||!validRemote(v.remoteId))
    return reply(422,{error:'Invalid remote confirmation'})
   fn='garmin_calendar_confirm_existing'
   args={p_id:v.id,p_revision:v.revision,p_date:v.date,p_workout_id:v.workoutId,
      p_remote_id:v.remoteId}
   break
  case 'finish':
   if(!validUuid(v.id)||!validUuid(v.attemptId)||
      !['confirmed','needs_review'].includes(String(v.status))||
      !['verified_read_back','multiple_matches','already_present','read_unavailable',
       'write_unavailable','rate_limited','auth_rejected','network_uncertain',
       'write_not_visible','unexpected_remote_shape','manual_review'].includes(String(v.code))||
      (v.status==='confirmed'&&!validRemote(v.remoteId)))
    return reply(422,{error:'Invalid calendar outcome'})
   fn='garmin_calendar_finish'
   args={p_id:v.id,p_attempt_id:v.attemptId,p_status:v.status,
      p_code:v.code,p_remote_id:v.status==='confirmed'?v.remoteId:null}
   break
  case 'rotate':
   if(!validId(v.expectedVersion)||!isGarminCloudSession(v.tokens))
    return reply(422,{error:'Invalid token rotation'})
   fn='garmin_connect_session_store'
   args={p_expected_version:v.expectedVersion,p_tokens:v.tokens}
   break
  case 'rate-limit':
   fn='garmin_cloud_auth_guard_rate_limit'
   args={}
   break
  default:return reply(422,{error:'Unknown calendar action'})
 }
 try{
  const {data,error}=await db.rpc(fn,args)
  if(error||!data)return reply(409,{error:'Private calendar transaction rejected'})
  return reply(200,data)
 }catch{return reply(503,{error:'Private calendar service unavailable'})}
})

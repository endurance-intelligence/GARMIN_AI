/**
 * GARMIN_AI v0.9.1 – manual-only, secretless GitHub OIDC bridge.
 *
 * SECURITY: no browser access, no public data. A signed GitHub OIDC identity
 * is verified against exact workflow, main branch and stable repository ID.
 * SUPABASE_SERVICE_ROLE_KEY is never configured in GitHub.
 *
 * Fail-closed feature flag: GARMIN_WEIGHT_WRITES_ENABLED must be 'true'
 * inside SUPABASE EDGE SECRETS before any token or mutation is available.
 * The client-side GitHub workflow has an independent opt-in variable.
 *
 * This function is NOT deployed/scheduled by committing these files.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@5.9.6'
import {isGarminCloudSession} from '../_shared/garmin-connect-tokens.mjs'
import {trustedWeightWorkflowClaims} from '../_shared/garmin-weight-worker-claims.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const audience='garmin-ai-weight:eurgupsebxypjqvyizci'
const keys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'))
const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff'
}
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers})
function serviceKey(){
  try{
    const values=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}') as Record<string,unknown>
    if(typeof values.default==='string'&&values.default)return values.default
  }catch {/*legacy fallback*/}
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}
// Initial production release is forcibly read-only even if a flag was accidentally set.
// Activation requires a separately reviewed Edge Function release.
const LIVE_WRITES_RELEASED=false
const enabled=()=>LIVE_WRITES_RELEASED && Deno.env.get('GARMIN_WEIGHT_WRITES_ENABLED')==='true'
const isDate=(date:unknown):date is string=>
  typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&
  Number.isFinite(Date.parse(date+'T12:00:00Z'))&&
  new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date
const isKg=(kg:unknown):kg is number=>
  typeof kg==='number'&&Number.isFinite(kg)&&kg>=30&&kg<=300&&
  Math.abs(Math.round(kg*10)-kg*10)<1e-7
const isRevision=(revision:unknown):revision is string=>
  typeof revision==='string'&&revision.length<50&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(revision)
const isUuid=(id:unknown):id is string=>
  typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

Deno.serve(async req=>{
  if(req.headers.has('origin'))return reply(403,{error:'No browser access'})
  if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'})
  if(Deno.env.get('SUPABASE_URL')!==project||!serviceKey())
    return reply(503,{error:'Private weight bridge not configured'})
  const identity=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!identity)return reply(401,{error:'Signed GitHub workflow token required'})

  // A token's claims are never sufficient by themselves. Verify its signed
  // issuer, audience, RS256 algorithm and remote JWKS before claim matching.
  try{
    const {payload}=await jwtVerify(identity[1],keys,{
      issuer:'https://token.actions.githubusercontent.com',
      audience,algorithms:['RS256'],clockTolerance:5
    })
    if(!trustedWeightWorkflowClaims(payload))
      return reply(403,{error:'GitHub weight workflow identity not allowed'})
  }catch{
    return reply(401,{error:'OIDC signature/identity invalid'})
  }

  const liveRequested=req.headers.get('x-garmin-weight-active')==='true'
  const authorizedForWrites=enabled()&&liveRequested
  const db=createClient(project,serviceKey(),{
    auth:{autoRefreshToken:false,persistSession:false}
  })
  if(req.method==='GET'){
    const next=await db.rpc('garmin_weight_next_pending')
    if(next.error)return reply(503,{error:'Weight queue migration not ready'})
    if(!authorizedForWrites)return reply(200,{
      mode:'dry-run',writerEnabled:false,
      pendingAvailable:next.data?.available===true
    })
    if(next.data?.available!==true)return reply(200,{
      mode:'enabled',writerEnabled:true,pendingAvailable:false
    })
    const session=await db.rpc('garmin_connect_session_get')
    if(session.error||!session.data?.connected||
       !Number.isSafeInteger(session.data.version)||session.data.version<1||
       !isGarminCloudSession(session.data.tokens))
      return reply(503,{error:'Private Garmin session unavailable'})
    return reply(200,{
      mode:'enabled',writerEnabled:true,pendingAvailable:true,
      pending:next.data,
      version:session.data.version,
      tokens:session.data.tokens
    })
  }
  // No posted operation can change weight or tokens without explicit
  // Supabase feature flag. 'dry-run' never returns any OAuth token.
  if(!authorizedForWrites)return reply(403,{error:'Garmin weight writes disabled'})
  if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
    return reply(415,{error:'JSON required'})
  if(Number(req.headers.get('content-length')||0)>23000)
    return reply(413,{error:'Payload too large'})
  const textBody=await req.text()
  if(textBody.length>23000)return reply(413,{error:'Payload too large'})
  let parsed:unknown
  try{parsed=JSON.parse(textBody)}catch{return reply(422,{error:'Invalid JSON'})}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    return reply(422,{error:'Invalid request'})
  const input=parsed as Record<string,unknown>
  let fn:string,args:Record<string,unknown>
  switch(input.action){
    case 'claim':
      if(!isDate(input.date)||!isKg(input.kg)||!isRevision(input.revision))
        return reply(422,{error:'Invalid claim'})
      fn='garmin_weight_claim'
      args={p_date:input.date,p_kg:input.kg,p_revision:input.revision}
      break
    case 'confirm-existing':
      if(!isDate(input.date)||!isKg(input.kg)||!isRevision(input.revision))
        return reply(422,{error:'Invalid confirmation'})
      fn='garmin_weight_confirm_existing'
      args={p_date:input.date,p_kg:input.kg,p_revision:input.revision}
      break
    case 'finish':
      if(!isDate(input.date)||!isUuid(input.attemptId)||
         !['confirmed','needs_review'].includes(String(input.status))||
         typeof input.code!=='string'||
         ![
           'verified_read_back','already_present','auth_rejected',
           'rate_limited','network_uncertain','garmin_response_invalid',
           'write_not_visible','invalid_garmin_day','different_remote_weight',
           'multiple_remote_entries','write_error','manual_review'
         ].includes(input.code))
        return reply(422,{error:'Invalid transfer outcome'})
      fn='garmin_weight_finish'
      args={p_date:input.date,p_attempt_id:input.attemptId,
        p_status:input.status,p_reason:input.code}
      break
    case 'rotate':
      if(!Number.isSafeInteger(input.expectedVersion)||
         Number(input.expectedVersion)<1||
         !isGarminCloudSession(input.tokens))
        return reply(422,{error:'Invalid token rotation'})
      fn='garmin_connect_session_store'
      args={p_tokens:input.tokens,p_expected_version:input.expectedVersion}
      break
    default:
      return reply(422,{error:'Unknown action'})
  }
  try{
    const {data,error}=await db.rpc(fn,args)
    if(error||!data)return reply(409,{error:'Private weight transaction could not be committed'})
    return reply(200,data)
  }catch{return reply(503,{error:'Weight worker unavailable'})}
})

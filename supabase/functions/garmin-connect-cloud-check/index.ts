/**
 * v0.7.6.2 - ON-DEMAND read-only Cloud-to-Garmin Connect verification.
 *
 * Owner-JWT authenticated. OAuth2 is retrieved in memory from service-only
 * Vault RPC. The Garmin profile, OAuth tokens, URL details, response text and
 * personal identifiers are NEVER sent to the browser or application logs.
 *
 * This does not refresh tokens. Expired session => explicit status; the future
 * trusted Node.js worker will handle Garmin OAuth1/OAuth2 refresh and polling.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {isGarminCloudSession} from '../_shared/garmin-connect-tokens.mjs'
import {classifyGarminCloudCheck,accessTokenNotExpired} from '../_shared/garmin-cloud-check.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()

function configuredKey(kind:'publishable'|'secret'):string {
  const modern=kind==='publishable'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
  const legacy=kind==='publishable'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const obj=JSON.parse(Deno.env.get(modern)||'{}') as Record<string,unknown>
    if(typeof obj.default==='string'&&obj.default)return obj.default
  }catch { /* legacy fallback */ }
  return Deno.env.get(legacy)||''
}
function cors(origin:string|null):Record<string,string> {
  const allowlist=(Deno.env.get('GARMIN_APP_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)
  const allowed=!!origin && (
    /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin) ||
    allowlist.includes(origin)
  )
  const h:Record<string,string>={
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'X-Content-Type-Options':'nosniff'
  }
  if(allowed&&origin){
    h['Access-Control-Allow-Origin']=origin
    h['Vary']='Origin'
  }
  return h
}
const respond=(status:number,value:unknown,h:Record<string,string>)=>
  new Response(JSON.stringify(value),{status,headers:h})

Deno.serve(async req=>{
  const origin=req.headers.get('origin')
  const headers=cors(origin)
  if(origin&&!headers['Access-Control-Allow-Origin'])
    return respond(403,{error:'Origin not allowed'},headers)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(req.method!=='POST')return respond(405,{error:'Method not allowed'},headers)
  if(Deno.env.get('SUPABASE_URL')!==project||!owner||
     !configuredKey('publishable')||!configuredKey('secret'))
    return respond(503,{error:'Cloud check not configured'},headers)

  const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!bearer)return respond(401,{error:'Login required'},headers)
  try {
    const auth=createClient(project,configuredKey('publishable'),{
      auth:{autoRefreshToken:false,persistSession:false}
    })
    const {data:{user},error:userError}=await auth.auth.getUser(bearer[1])
    if(userError||!user)return respond(401,{error:'Invalid session'},headers)
    if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
      return respond(403,{error:'Owner authorization required'},headers)

    const db=createClient(project,configuredKey('secret'),{
      auth:{autoRefreshToken:false,persistSession:false}
    })
    const {data:stored,error:readError}=await db.rpc('garmin_connect_session_get')
    if(readError)return respond(503,{error:'Vault access unavailable'},headers)
    if(!stored?.connected)
      return respond(409,{status:'not_connected',verified:false},headers)
    if(!isGarminCloudSession(stored.tokens))
      return respond(503,{status:'invalid_session',verified:false},headers)

    const session=stored.tokens as {
      oauth2:{access_token:string;expires_at:number}
    }
    let outcome='unavailable'
    if(!accessTokenNotExpired(session.oauth2.expires_at)){
      outcome='expired'
    }else{
      // Garmin's unofficial private Connect endpoint, read-only.
      // No redirects to arbitrary hosts (avoid bearer token forwarding).
      try {
        const response=await fetch('https://connectapi.garmin.com/userprofile-service/socialProfile',{
          method:'GET',redirect:'error',cache:'no-store',
          headers:{
            'Authorization':'Bearer '+session.oauth2.access_token,
            'Accept':'application/json',
            'User-Agent':'GCM-iOS-5.22.1.4'
          },
          signal:AbortSignal.timeout(12000)
        })
        let parsed:unknown=null
        if(response.ok){
          try {parsed=await response.json()}catch {parsed=null}
        }
        outcome=classifyGarminCloudCheck(response.status,parsed)
      }catch { outcome='unavailable' }
    }

    const {data:recorded,error:writeError}=await db.rpc('garmin_connect_cloud_check_record',{
      p_result:outcome
    })
    if(writeError||!recorded?.saved)
      return respond(503,{error:'Cloud check could not be recorded'},headers)
    return respond(200,{
      status:outcome,verified:outcome==='verified',
      checkedAt:new Date().toISOString(),
      readOnly:true
    },headers)
  }catch {
    // Never log raw SDK errors: OAuth/Supabase details may be embedded.
    return respond(503,{error:'Cloud check unavailable'},headers)
  }
})

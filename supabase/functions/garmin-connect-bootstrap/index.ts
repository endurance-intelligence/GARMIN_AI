/**
 * v0.7.6.1 - ONE-TIME, owner-approved transport of local Garmin Connect OAuth
 * session into encrypted Supabase Vault.
 *
 * The tokens never pass through the browser. They arrive directly from the
 * loopback-only GARMIN_AI Node/Vite adapter over HTTPS after an explicit click.
 *
 * This function never returns/logs OAuth tokens, never writes to Garmin,
 * and refuses to overwrite an existing Cloud Connect session.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {isGarminCloudSession} from '../_shared/garmin-connect-tokens.mjs'

const endpoint=Deno.env.get('SUPABASE_URL')||''
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const expected='https://eurgupsebxypjqvyizci.supabase.co'
function envKey(kind:'publishable'|'secret'):string {
  const modern=kind==='publishable'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
  const legacy=kind==='publishable'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const value=JSON.parse(Deno.env.get(modern)||'{}') as Record<string,unknown>
    if(typeof value.default==='string'&&value.default)return value.default
  } catch { /* legacy fallback */ }
  return Deno.env.get(legacy)||''
}
function headers(origin:string|null) {
  const local=!!origin && /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)
  return {
    ...(local?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),
    'Access-Control-Allow-Headers':'authorization,apikey,content-type',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }
}
const reply=(status:number,body:unknown,h:Record<string,string>)=>
  new Response(JSON.stringify(body),{status,headers:h})

Deno.serve(async req=>{
  const origin=req.headers.get('origin')
  const h=headers(origin)
  // Explicitly accept the local origin only; no remote website may submit
  // through a logged-in browser. Server-to-server requests have no origin.
  if(origin&&!h['Access-Control-Allow-Origin']) return reply(403,{error:'Origin not allowed'},h)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'},h)
  if(endpoint!==expected||!owner||!envKey('publishable')||!envKey('secret'))
    return reply(503,{error:'Cloud Connect not configured'},h)

  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!match)return reply(401,{error:'Login required'},h)
  try {
    const auth=createClient(endpoint,envKey('publishable'),{
      auth:{autoRefreshToken:false,persistSession:false}
    })
    const {data:{user},error:authError}=await auth.auth.getUser(match[1])
    if(authError||!user)return reply(401,{error:'Invalid login'},h)
    if(!user.email_confirmed_at || user.email?.trim().toLowerCase()!==owner)
      return reply(403,{error:'Owner authorization required'},h)

    const db=createClient(endpoint,envKey('secret'),{
      auth:{autoRefreshToken:false,persistSession:false}
    })
    const {data:existing,error:stateError}=await db.rpc('garmin_connect_session_state')
    if(stateError)return reply(503,{error:'Vault foundation not available'},h)
    if(existing?.connected===true)
      return reply(409,{error:'Cloud Connect session already present; no overwrite permitted'},h)

    if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
      return reply(415,{error:'JSON required'},h)
    const size=Number(req.headers.get('content-length')||'0')
    if(size>20000)return reply(413,{error:'Payload too large'},h)
    const body=await req.text()
    if(body.length>20000)return reply(413,{error:'Payload too large'},h)
    let payload:unknown
    try {payload=JSON.parse(body)}catch{return reply(422,{error:'Invalid JSON'},h)}
    if(!payload||typeof payload!=='object'||Array.isArray(payload))
      return reply(422,{error:'Invalid envelope'},h)
    const input=payload as Record<string,unknown>
    if(input.consent!==true || input.expectedVersion!==0 ||
      !isGarminCloudSession(input.tokens))
      return reply(422,{error:'Consent or session validation failed'},h)

    const {data:saved,error:writeError}=await db.rpc('garmin_connect_session_store',{
      p_tokens:input.tokens,p_expected_version:0
    })
    // A failure could have written the session already. Do not attempt a
    // second insert: the next GET will show whether Vault has a session.
    if(writeError||saved?.saved!==true)
      return reply(502,{error:'Vault confirmation unavailable; check Cloud status before retrying'},h)
    return reply(200,{saved:true,storedIn:'Supabase Vault',cloudReadVerified:false},h)
  }catch {
    // Never include underlying Supabase/Garmin error data in responses/logs.
    return reply(502,{error:'Cloud Connect bootstrap unavailable; inspect status'},h)
  }
})

/**
 * GARMIN_AI v0.8.0: owner-only access check for publicly hosted static
 * application. The static JavaScript is public; ALL private Garmin data
 * remains behind independently authenticated Supabase Edge functions.
 *
 * Never return Garmin profile, OAuth tokens, email, or service-role credentials.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function key():string{
  try {
    const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}') as Record<string,unknown>
    if(typeof keys.default==='string'&&keys.default)return keys.default
  }catch { /* supported legacy deployment */ }
  return Deno.env.get('SUPABASE_ANON_KEY')||''
}
function cors(origin:string|null):Record<string,string>{
  const accepted=origin==='https://endurance-intelligence.github.io' ||
    (!!origin&&/^http:\/\/(127\.0\.0\.1|localhost):517[3-9]$/.test(origin))
  const headers:Record<string,string>={
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Methods':'GET,OPTIONS',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Cache-Control':'no-store, private',
    'X-Content-Type-Options':'nosniff'
  }
  if(accepted&&origin){
    headers['Access-Control-Allow-Origin']=origin
    headers['Vary']='Origin'
  }
  return headers
}
const response=(status:number,payload:unknown,headers:Record<string,string>)=>
  new Response(JSON.stringify(payload),{status,headers})
Deno.serve(async req=>{
  const origin=req.headers.get('origin')
  const headers=cors(origin)
  if(origin&&!headers['Access-Control-Allow-Origin'])
    return response(403,{authorized:false},headers)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(req.method!=='GET')return response(405,{authorized:false},headers)
  if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key())
    return response(503,{authorized:false},headers)
  const token=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')?.[1]
  if(!token)return response(401,{authorized:false},headers)
  try {
    const auth=createClient(project,key(),{
      auth:{persistSession:false,autoRefreshToken:false}
    })
    const {data:{user},error}=await auth.auth.getUser(token)
    if(error||!user)return response(401,{authorized:false},headers)
    if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
      return response(403,{authorized:false},headers)
    return response(200,{authorized:true},headers)
  } catch {
    return response(503,{authorized:false},headers)
  }
})

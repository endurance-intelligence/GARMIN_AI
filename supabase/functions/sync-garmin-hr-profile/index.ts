/** GARMIN_AI v0.6.2 - owner-authenticated Garmin running HR profile sync.
 * GET reads current profile + change history. POST checks Garmin Personal API.
 * No raw settings/profile payloads in responses or tables. Never writes to Garmin.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseGarminHrProfile } from './profileParser.ts'
import { allowedHrProfileOrigin } from './corsPolicy.mjs'

const base = 'https://personal.connectapi.garmin.com'
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const ownerEmail = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL') ?? '').trim().toLowerCase()
type AnyObject = Record<string, unknown>
function key(type: 'publishable'|'secret'): string {
  const modern = type === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS'
  const legacy = type === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const set = JSON.parse(Deno.env.get(modern) ?? '{}') as AnyObject
    if (typeof set.default === 'string' && set.default) return set.default
  } catch { /* legacy below */ }
  return Deno.env.get(legacy) ?? ''
}
function cors(origin: string | null): Record<string,string> {
  const allow = allowedHrProfileOrigin(origin)
  return {
    ...(allow ? {'Access-Control-Allow-Origin':origin!,Vary:'Origin'} : {}),
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }
}
function json(value:unknown, status:number, headers:Record<string,string>) {
  return new Response(JSON.stringify(value),{status,headers})
}
async function call(path:string, token:string, method:'GET'|'POST'='GET') {
  const response = await fetch(base + path, {
    method, headers: method === 'POST'
      ? { Authorization: `ApiKey ${token}` }
      : { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal:AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`garmin_http_${response.status}`)
  return await response.text()
}
async function getToken(apiKey:string) {
  let raw:string
  try {raw=await call('/personalapitoken-service/personal-api/personal-api-key/token',apiKey,'POST')}
  catch(e) {
    const message=e instanceof Error ? e.message : ''
    if(/^garmin_http_\d{3}$/.test(message)) throw new Error('garmin_token_http_'+message.slice(-3))
    throw e
  }
  const content = raw.trim()
  let token = content.replace(/^"|"$/g,'')
  if (content.startsWith('{')) {
    const result = JSON.parse(content) as AnyObject
    token = String(result.access_token ?? result.accessToken ?? result.token ?? '')
  }
  if (!/^[A-Za-z0-9_+/.=-]{20,4096}$/.test(token)) throw new Error('garmin_token_format')
  return token
}
function safeParse(content:string):unknown { try {return JSON.parse(content)} catch {throw new Error('garmin_non_json')} }
// Do not expose tokens, response bodies, or private profile fields in diagnostics.
// Garmin's published client uses v2; the web app also uses an explicit generateDefaults parameter.
type Check = { route: 'zones-v2'|'zones-v2-no-defaults'|'zones-v2-empty-defaults'|'zones-v1'|'profile-settings'; status: number; parsed?: boolean }
const zoneRoutes: {route:Check['route']; path:string}[] = [
  {route:'zones-v2', path:'/biometric-service/heartRateZones/v2'},
  {route:'zones-v2-no-defaults',path:'/biometric-service/heartRateZones/v2?generateDefaults=false'},
  {route:'zones-v2-empty-defaults',path:'/biometric-service/heartRateZones/v2?generateDefaults='},
  {route:'zones-v1',path:'/biometric-service/heartRateZones/'},
]
async function inspect(path:string, token:string): Promise<{status:number;payload:unknown|null}> {
  const response = await fetch(base + path, {
    method:'GET',
    headers:{Authorization:`Bearer ${token}`, Accept:'application/json'},
    signal:AbortSignal.timeout(15000),
  })
  if (!response.ok) return {status:response.status,payload:null}
  const content=await response.text()
  // Non-JSON or unexpectedly large responses are never stored or surfaced.
  if (content.length>1_000_000) return {status:response.status,payload:null}
  try { return {status:response.status,payload:JSON.parse(content)} }
  catch { return {status:response.status,payload:null} }
}
async function fingerprint(payload:unknown):Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')
}
function safeMessage(error:unknown):string {
  const message = error instanceof Error ? error.message : ''
  return /^(garmin_http|garmin_token_http)_\d{3}$/.test(message) ? message :
    ['garmin_non_json','garmin_token_format','unrecognized_running_zones','garmin_zones_unavailable','profile_store_failed','profile_status_failed','garmin_api_key_missing'].includes(message) ? message : 'profile_sync_failed'
}
function asNumber(x:unknown):number|null {
  const n = typeof x === 'number' ? x : null
  return n !== null && Number.isInteger(n) && n >= 25 && n <= 120 ? n : null
}

Deno.serve(async (req:Request) => {
  const origin = req.headers.get('origin')
  const headers = cors(origin)
  if (origin && !headers['Access-Control-Allow-Origin']) return json({error:'origin_not_allowed'},403,headers)
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers})
  if (!['GET','POST'].includes(req.method)) return json({error:'method_not_allowed'},405,headers)
  if (!supabaseUrl || !ownerEmail || !key('publishable') || !key('secret')) return json({error:'configuration_missing'},503,headers)
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')??'')
  if (!bearer) return json({error:'login_required'},401,headers)
  try {
    const auth = createClient(supabaseUrl,key('publishable'), {auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:authError} = await auth.auth.getUser(bearer[1])
    if (authError || !user) return json({error:'invalid_session'},401,headers)
    if (!user.email_confirmed_at || user.email?.trim().toLowerCase() !== ownerEmail) return json({error:'not_authorized'},403,headers)

    const admin = createClient(supabaseUrl,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
    const latest = async () => {
      const [snapshots,status] = await Promise.all([
        admin.from('garmin_hr_profile_snapshots').select('observed_at,profile').order('observed_at',{ascending:false}).limit(12),
        admin.from('garmin_hr_profile_sync_status').select('last_attempt_at,last_success_at,last_error').eq('id',true).maybeSingle(),
      ])
      if (snapshots.error || status.error) throw new Error('profile_store_failed')
      return {profile:snapshots.data?.[0]?.profile??null,observedAt:snapshots.data?.[0]?.observed_at??null,
        history:(snapshots.data??[]).map(x=>({observedAt:x.observed_at,profile:x.profile})),
        lastAttemptAt:status.data?.last_attempt_at??null,lastSuccessAt:status.data?.last_success_at??null,
        lastError:status.data?.last_error??null}
    }
    if (req.method === 'GET') return json(await latest(),200,headers)

    const last = await admin.from('garmin_hr_profile_sync_status').select('last_attempt_at,last_success_at').eq('id',true).maybeSingle()
    if (last.error) throw new Error('profile_status_failed')
    // Automatic refresh every ~6h; manual retry no more than once per minute.
    const explicit = new URL(req.url).searchParams.get('force') === '1'
    const lastAttempt = last.data?.last_attempt_at ? Date.parse(last.data.last_attempt_at) : 0
    const elapsed = Date.now() - (Number.isFinite(lastAttempt)? lastAttempt:0)
    if (elapsed < (explicit? 60_000:6*3600_000)) return json({skipped:true,reason:'recently_checked',...(await latest())},200,headers)

    const now = new Date().toISOString()
    const {error:attemptError} = await admin.from('garmin_hr_profile_sync_status')
      .upsert({id:true,last_attempt_at:now,last_error:null},{onConflict:'id'})
    if (attemptError) throw new Error('profile_status_failed')
    const checks:Check[]=[]
    try {
      const apiKey = Deno.env.get('GARMIN_API_KEY')??''
      if (!apiKey) throw new Error('garmin_api_key_missing')
      const token = await getToken(apiKey)
      // Check profile settings independently so HTTP 406 can be attributed to the actual endpoint.
      const settingsResult=await inspect('/userprofile-service/userprofile/settings',token)
      checks.push({route:'profile-settings',status:settingsResult.status})
      // Never generate defaults on Garmin or change the user's configured zones.
      let parsed:ReturnType<typeof parseGarminHrProfile>=null
      for (const candidate of zoneRoutes) {
        const result=await inspect(candidate.path,token)
        const check:Check={route:candidate.route,status:result.status}
        if(result.status===200 && result.payload!==null) {
          parsed=parseGarminHrProfile(result.payload,settingsResult.payload??{})
          check.parsed=parsed!==null
        }
        checks.push(check)
        if(parsed) break
        // Stop early on auth/access/rate limits, instead of sending avoidable requests.
        if([401,403,429].includes(result.status)) break
      }
      if (!parsed) throw new Error('garmin_zones_unavailable')
      // Garmin's daily resting heart rate is a separate measurement; do not call it a fixed profile setting.
      if (parsed.restingHr === null) {
        const day = await admin.from('garmin_daily_metrics').select('metric_date,resting_heart_rate')
          .not('resting_heart_rate','is',null).order('metric_date',{ascending:false}).limit(1)
        if (!day.error && day.data?.length) {
          const n=asNumber(day.data[0].resting_heart_rate)
          if (n !== null) { parsed.restingHr=n; parsed.sources.restingHr=`Garmin Tageswert ${day.data[0].metric_date}` }
        }
      }
      const hash = await fingerprint(parsed)
      const {error:insertError} = await admin.from('garmin_hr_profile_snapshots')
        .upsert({fingerprint:hash,source:'garmin-personal-api',profile:parsed,observed_at:now}, {onConflict:'fingerprint',ignoreDuplicates:true})
      if (insertError) throw new Error('profile_store_failed')
      const {error:statusError} = await admin.from('garmin_hr_profile_sync_status')
        .update({last_success_at:now,last_error:null}).eq('id',true)
      if (statusError) throw new Error('profile_status_failed')
      return json({ok:true,checks,...(await latest())},200,headers)
    } catch(e) {
      const code=safeMessage(e)
      await admin.from('garmin_hr_profile_sync_status').update({last_error:code}).eq('id',true)
      return json({ok:false,error:code,checks,...(await latest())},200,headers)
    }
  } catch {
    return json({error:'profile_unavailable'},502,headers)
  }
})

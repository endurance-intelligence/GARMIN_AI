/**
 * GARMIN_AI v0.7.7.1 - minimal GitHub Actions OIDC -> Supabase Vault bridge.
 * A signed GitHub Actions identity token, NOT a service-role key or static
 * shared secret, authorizes this exact workflow on the main branch.
 * Response includes sensitive Garmin tokens, only to the trusted cloud job.
 * No Garmin API writes and no snapshot changes are performed here.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@5.9.6'
import {isGarminCloudSession} from '../_shared/garmin-connect-tokens.mjs'
import {trustedGarminWorkerClaims} from '../_shared/garmin-worker-claims.mjs'
import {mergeActivityGear,selectActivityTargets,runningSport} from '../_shared/garmin-gear-incremental.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const audience='garmin-ai-cloud-audit:eurgupsebxypjqvyizci'
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'))
const headers={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, private',
  'X-Content-Type-Options':'nosniff'
}
const respond=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers})
function secretKey(){
  try {
    const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}') as Record<string,unknown>
    if(typeof keys.default==='string'&&keys.default)return keys.default
  }catch { /* legacy fallback */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}

Deno.serve(async req=>{
  // This is NOT a browser endpoint. CORS preflight and browser Origins denied.
  if(req.headers.has('origin'))return respond(403,{error:'No browser access'})
  if(req.method!=='GET'&&req.method!=='POST')
    return respond(405,{error:'Method not allowed'})
  if(Deno.env.get('SUPABASE_URL')!==project||!secretKey())
    return respond(503,{error:'Worker bridge not configured'})
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!match)return respond(401,{error:'GitHub OIDC identity required'})
  try {
    const {payload}=await jwtVerify(match[1],jwks,{
      issuer:'https://token.actions.githubusercontent.com',
      audience,
      algorithms:['RS256'],
      clockTolerance:5
    })
    // Repository IDs are stable even if display names change.
    if(!trustedGarminWorkerClaims(payload))
      return respond(403,{error:'Untrusted GitHub workflow identity'})
    const db=createClient(project,secretKey(),{
      auth:{autoRefreshToken:false,persistSession:false}
    })
    if(req.method==='GET'){
      const since=new Date(Date.now()-21*86400000).toISOString().slice(0,10)
      const [session,baseline,activities]=await Promise.all([
        db.rpc('garmin_connect_session_get'),
        db.from('garmin_connect_snapshot')
          .select('gear,schedule,activity_gear,activity_gear_scope,synced_at')
          .eq('snapshot_key','primary').maybeSingle(),
        db.from('garmin_activities').select('activity_id,start_time_local,sport_type')
          .gte('start_time_local',since).order('start_time_local',{ascending:false}).limit(100)
      ])
      if(session.error||baseline.error||activities.error||!session.data?.connected||
         !Number.isSafeInteger(session.data.version)||!isGarminCloudSession(session.data.tokens)||
         baseline.data?.activity_gear_scope!=='complete'||!Array.isArray(baseline.data.activity_gear)||
         !Array.isArray(baseline.data.gear)||!baseline.data.synced_at)
        return respond(503,{error:'Private Garmin prerequisites unavailable'})
      return respond(200,{
        version:session.data.version,
        tokens:session.data.tokens,
        baseline:baseline.data,
        incrementalTargets:selectActivityTargets(activities.data||[],
          baseline.data.activity_gear,new Date().toISOString().slice(0,10))
      })
    }
    if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
      return respond(415,{error:'JSON required'})
    if(Number(req.headers.get('content-length')||0)>23000)
      return respond(413,{error:'Payload too large'})
    const body=await req.text()
    if(body.length>23000)return respond(413,{error:'Payload too large'})
    let input:unknown
    try{input=JSON.parse(body)}catch{return respond(422,{error:'Malformed JSON'})}
    if(!input||typeof input!=='object'||Array.isArray(input))
      return respond(422,{error:'Invalid request'})
    const value=input as Record<string,unknown>
    if(value.action==='incremental-gear'){
      // This action remains available ONLY to GitHub OIDC from the trusted
      // main-branch Cloud Audit workflow. No browser or Supabase anon access.
      const reports=value.reports
      const expected=value.expectedSyncedAt
      if(typeof expected!=='string'||!Number.isFinite(Date.parse(expected))||
         !Array.isArray(reports)||reports.length<1||reports.length>30)
        return respond(422,{error:'Invalid gear reconciliation'})
      const ids=reports.map((r:Record<string,unknown>)=>r?.activityId)
      if(ids.some(x=>typeof x!=='string'||!/^\d{5,20}$/.test(x))||
         new Set(ids).size!==ids.length)
        return respond(422,{error:'Invalid activity reconciliation IDs'})
      const [current,activities]=await Promise.all([
        db.from('garmin_connect_snapshot').select(
          'gear,activity_gear,activity_gear_scope,synced_at'
        ).eq('snapshot_key','primary').maybeSingle(),
        db.from('garmin_activities').select('activity_id,start_time_local,sport_type')
          .in('activity_id',ids)
      ])
      if(current.error||activities.error||!current.data||
         current.data.activity_gear_scope!=='complete')
        return respond(503,{error:'Verified gear baseline unavailable'})
      if(current.data.synced_at!==expected)
        return respond(409,{error:'Gear snapshot changed, rerun reconciliation'})
      const allowed=new Set((activities.data||[]).filter(a=>
        runningSport(a.sport_type)&&
        Date.parse(String(a.start_time_local||'').slice(0,10)+'T12:00:00Z')>=Date.now()-22*86400000
      ).map(a=>String(a.activity_id)))
      if(allowed.size!==ids.length||ids.some(x=>!allowed.has(x)))
        return respond(422,{error:'One or more activities not verified as recent Garmin runs'})
      let merged
      try {
        merged=mergeActivityGear(current.data.activity_gear,current.data.gear,reports)
      }catch{
        return respond(409,{error:'Unrecognized or duplicate Garmin gear association'})
      }
      const when=new Date().toISOString()
      const {data:saved,error:writeError}=await db.from('garmin_connect_snapshot')
        .update({activity_gear:merged.links,synced_at:when,gear_links_checked_at:when,
          gear_links_sync_source:'cloud'})
        .eq('snapshot_key','primary').eq('synced_at',expected)
        .select('snapshot_key').maybeSingle()
      if(writeError||!saved)
        return respond(409,{error:'Gear reconciliation conflicted or could not be saved'})
      return respond(200,{saved:true,verified:merged.verifiedActivities,
        added:merged.added,removed:merged.removed,total:merged.links.length,
        checkedAt:when,garminWritten:false})
    }
    if(!Number.isSafeInteger(value.expectedVersion)||Number(value.expectedVersion)<1||
       !isGarminCloudSession(value.tokens))
      return respond(422,{error:'Invalid token-rotation payload'})
    const {data:saved,error:saveError}=await db.rpc('garmin_connect_session_store',{
      p_tokens:value.tokens,p_expected_version:value.expectedVersion
    })
    if(saveError||saved?.saved!==true)
      return respond(409,{error:'OAuth rotation not confirmed; investigate before another run'})
    return respond(200,{saved:true})
  }catch{
    // Never log raw auth or Garmin exceptions (could contain credentials).
    return respond(401,{error:'GitHub OIDC identity could not be verified'})
  }
})

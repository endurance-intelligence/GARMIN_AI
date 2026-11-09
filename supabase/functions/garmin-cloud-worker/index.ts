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
      // Hard-stop after Garmin HTTP 429: deny tokens before any private API call.
      const {data:guard,error:guardError}=await db.rpc('garmin_cloud_auth_guard_state')
      if(guardError||!guard)return respond(503,{error:'Garmin OAuth guard unavailable'})
      if(guard.allowed!==true)return respond(429,{error:'Garmin OAuth cooldown active'})
      const [session,baseline]=await Promise.all([
        db.rpc('garmin_connect_session_get'),
        db.from('garmin_connect_snapshot')
          .select('gear,schedule,activity_gear,activity_gear_scope,synced_at')
          .eq('snapshot_key','primary').maybeSingle()
      ])
      if(session.error||baseline.error||!session.data?.connected||
         !Number.isSafeInteger(session.data.version)||!isGarminCloudSession(session.data.tokens)||
         baseline.data?.activity_gear_scope!=='complete')
        return respond(503,{error:'Private Garmin prerequisites unavailable'})
      return respond(200,{
        version:session.data.version,
        tokens:session.data.tokens,
        baseline:baseline.data
      })
    }
    if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
      return respond(415,{error:'JSON required'})
    if(Number(req.headers.get('content-length')||0)>170000)
      return respond(413,{error:'Payload too large'})
    const body=await req.text()
    if(body.length>170000)return respond(413,{error:'Payload too large'})
    let input:unknown
    try{input=JSON.parse(body)}catch{return respond(422,{error:'Malformed JSON'})}
    if(!input||typeof input!=='object'||Array.isArray(input))
      return respond(422,{error:'Invalid request'})
    const value=input as Record<string,unknown>
    // Only an exact signed cloud-audit workflow may report a Garmin 429.
    // No remote Garmin call, profile or token required for this action.
    if(value.action==='rate-limit'){
      const {data:recorded,error:guardError}=await db.rpc('garmin_cloud_auth_guard_rate_limit')
      if(guardError||recorded?.recorded!==true)
        return respond(503,{error:'Garmin OAuth cooldown could not be saved'})
      return respond(200,{recorded:true})
    }

    if(value.action==='save-reviewed-snapshot'){
      // Garmin-side READS only. This updates our private cached snapshot;
      // it never schedules, uploads, edits or deletes anything in Garmin.
      const plain=(v:unknown):v is Record<string,unknown>=>
        !!v&&typeof v==='object'&&!Array.isArray(v)
      const day=(v:unknown):v is string=>
        typeof v==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(v)&&
        !Number.isNaN(Date.parse(v+'T12:00:00Z'))&&
        new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v
      const canon=(v:unknown)=>
        typeof v==='string'&&/^[a-f0-9-]{32,36}$/i.test(v)&&
        /^[a-f0-9]{32}$/.test(v.replace(/-/g,''))?v.replace(/-/g,'').toLowerCase():null
      const start=value.windowStart,end=value.windowEnd
      if(!day(start)||!day(end)||end<start||
         Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z')>90*86400000||
         typeof value.expectedSyncedAt!=='string'||
         !/^\\d{4}-\\d{2}-\\d{2}T/.test(value.expectedSyncedAt)||
         !Array.isArray(value.gear)||value.gear.length<1||value.gear.length>100||
         !Array.isArray(value.schedule)||value.schedule.length>500||
         !Array.isArray(value.activityGear)||value.activityGear.length>3000)
        return respond(422,{error:'Invalid cloud snapshot envelope'})
      const gear=value.gear as unknown[]
      const schedule=value.schedule as unknown[]
      const links=value.activityGear as unknown[]
      const ids=new Set<string>()
      for(const g of gear){
        if(!plain(g))return respond(422,{error:'Invalid gear row'})
        const id=canon(g.id)
        if(!id||ids.has(id)||!['active','retired','unknown'].includes(String(g.status))||
           (g.name!==null&&(typeof g.name!=='string'||g.name.length>180))||
           (g.brand!==null&&(typeof g.brand!=='string'||g.brand.length>180))||
           (g.model!==null&&(typeof g.model!=='string'||g.model.length>180)))
          return respond(422,{error:'Invalid or repeated gear'})
        ids.add(id)
      }
      if(gear.every(g=>(g as Record<string,unknown>).status==='unknown'))
        return respond(422,{error:'No verified gear status'})
      const linkKeys=new Set<string>()
      for(const x of links){
        if(!plain(x)||typeof x.activityId!=='string'||
           !/^\\d{5,20}$/.test(x.activityId)||!ids.has(canon(x.gearId)||''))
          return respond(422,{error:'Invalid activity association'})
        const key=x.activityId+':'+canon(x.gearId)
        if(linkKeys.has(key))return respond(422,{error:'Repeated activity association'})
        linkKeys.add(key)
      }
      const dates=new Set<string>()
      for(const w of schedule){
        if(!plain(w)||!day(w.date)||w.date<start||w.date>end||
          !['string','object'].includes(typeof w.name)|| 
          (w.name!==null&&(typeof w.name!=='string'||w.name.length>180))||
          (w.id!==null&&(typeof w.id!=='string'||w.id.length>80))||
          (w.workoutId!==null&&(typeof w.workoutId!=='string'||w.workoutId.length>80))||
          (w.sport!==null&&(typeof w.sport!=='string'||w.sport.length>180))||
          typeof w.restDay!=='boolean')
          return respond(422,{error:'Invalid scheduled item'})
        const key=JSON.stringify([w.date,w.id,w.workoutId,w.name])
        if(dates.has(key))return respond(422,{error:'Repeated scheduled item'})
        dates.add(key)
      }
      const {data:previous,error:readError}=await db.from('garmin_connect_snapshot')
        .select('gear,schedule,activity_gear,activity_gear_scope,synced_at')
        .eq('snapshot_key','primary').maybeSingle()
      if(readError||!previous||previous.activity_gear_scope!=='complete'||
         previous.synced_at!==value.expectedSyncedAt)
        return respond(409,{error:'Verified baseline changed; no snapshot updated'})
      const previousGear=(Array.isArray(previous.gear)?previous.gear:[]) as Record<string,unknown>[]
      if(previousGear.some(g=>!ids.has(canon(g.id)||'')))
        return respond(409,{error:'Garmin gear disappeared; manual review required'})
      const previousLinks=Array.isArray(previous.activity_gear)?previous.activity_gear:[]
      if(previousLinks.length>20&&links.length<previousLinks.length*0.7)
        return respond(409,{error:'Large association loss; manual review required'})
      // Preserve historical calendar entries outside the audited date window.
      const oldSchedule=Array.isArray(previous.schedule)?previous.schedule:[]
      const retained=oldSchedule.filter((x:Record<string,unknown>)=>
        typeof x.date==='string'&&(x.date<start||x.date>end))
      const mergedSchedule=[...retained,...schedule]
      if(mergedSchedule.length>500)return respond(422,{error:'Calendar range exceeds limit'})
      const now=new Date().toISOString()
      const {data:saved,error:saveError}=await db.from('garmin_connect_snapshot')
        .update({gear,schedule:mergedSchedule,activity_gear:links,
          activity_gear_scope:'complete',checked_at:now,
          gear_links_checked_at:now,synced_at:now})
        .eq('snapshot_key','primary').eq('synced_at',previous.synced_at)
        .select('snapshot_key').maybeSingle()
      if(saveError||!saved)return respond(409,{error:'Snapshot changed; no partial update'})
      return respond(200,{saved:true,gear:gear.length,
        associations:links.length,scheduled:schedule.length})
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

/**
 * GARMIN_AI – owner-only, on-demand reference-route candidates.
 * Read-only: raw positions, Garmin activity IDs and FIT samples never leave the server.
 * Not a GPS-track verification or a claim of proven endurance adaptation.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {candidateIds,buildReferenceRoutes} from './model.mjs'

const project=Deno.env.get('SUPABASE_URL')||''
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const RUN_LIMIT=400
const DETAIL_LIMIT=180
const isDev=(origin:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
function key(kind:'public'|'secret'){
  try{
    const k=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
    if(typeof k.default==='string'&&k.default)return k.default
  }catch{/* Legacy key fallback */}
  return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
function headers(origin:string|null){
  const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
  return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,OPTIONS',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const respond=(status:number,data:unknown,h:Record<string,string>)=>
  new Response(JSON.stringify(data),{status,headers:h})

Deno.serve(async req=>{
  const origin=req.headers.get('origin'),h=headers(origin)
  if(origin&&!h['Access-Control-Allow-Origin'])return respond(403,{error:'Origin not allowed'},h)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
  if(req.method!=='GET')return respond(405,{error:'Read-only'},h)
  if(!project||!owner||!key('public')||!key('secret'))
    return respond(503,{error:'Private reference-route analysis not configured'},h)
  const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!bearer)return respond(401,{error:'Login required'},h)
  try{
    const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:authError}=await auth.auth.getUser(bearer[1])
    if(authError||!user)return respond(401,{error:'Invalid session'},h)
    if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
      return respond(403,{error:'Owner only'},h)

    const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
    const oldest=new Date(Date.now()-730*86400000).toISOString().slice(0,10)
    const activities=await db.from('garmin_activities')
      .select('activity_id,start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw,raw_activity')
      .eq('sport_type','running').gte('start_time_local',oldest)
      .order('start_time_local',{ascending:false}).limit(RUN_LIMIT)
    if(activities.error)throw Error('Garmin run list '+activities.error.code)
    const rows=activities.data||[]
    // Status-only private query: never transfer coordinates for an import
    // progress widget. Count is exact; >500 rows deliberately yields no
    // potentially misleading percentage from a truncated sample.
    const importQuery=await db.from('garmin_route_tracks')
      .select('status,checked_at',{count:'exact'}).limit(500)
    if(importQuery.error)throw Error('GPS import status '+importQuery.error.code)
    const states=importQuery.data||[]
    const importTotal=importQuery.count??states.length
    const importCapped=importTotal>states.length
    const countStatus=(s:string)=>states.filter(x=>x.status===s).length
    const completed=countStatus('complete')
    const pending=countStatus('queued')+countStatus('processing')+countStatus('retry')
    const unavailable=countStatus('unavailable')+countStatus('paused')
    const lastCompletedAt=states.filter(x=>x.status==='complete'&&x.checked_at)
      .map(x=>String(x.checked_at)).sort().at(-1)||null
    const importStatus={
      total:importTotal,completed,pending,unavailable,capped:importCapped,
      percent:importCapped||importTotal===0?null:Math.round(100*completed/importTotal),
      lastCompletedAt
    }
    // Preselect by coarse GPS endpoints before transferring any high-volume
    // sample arrays. No analysis on non-repeating metadata candidates.
    const eligible=candidateIds(rows)
    const chosen=eligible.slice(0,DETAIL_LIMIT)
    const details:unknown[]=[]
    const tracks:unknown[]=[]
    for(let i=0;i<chosen.length;i+=15){
      const batch=chosen.slice(i,i+15)
      const response=await db.from('garmin_activity_details')
        .select('activity_id,status,samples').in('activity_id',batch)
      if(response.error)throw Error('Garmin sample read '+response.error.code)
      details.push(...(response.data||[]))
      const gps=await db.from('garmin_route_tracks')
        .select('activity_id,status,fingerprint').in('activity_id',batch)
      if(gps.error)throw Error('Private GPS evidence '+gps.error.code)
      tracks.push(...(gps.data||[]))
    }
    const result=buildReferenceRoutes(rows,
      details as {activity_id:string;status:string;samples:unknown[]}[],{
        tracks:tracks as {activity_id:string;status:string;fingerprint:unknown}[]})
    return respond(200,{
      ...result,
      importStatus,
      source:'Garmin · gespeicherte Laufdaten · letzter 24-Monats-Zeitraum',
      scan:{runningRead:rows.length,metadataCandidates:eligible.length,
        samplesExamined:details.length,gpsEvidenceRead:tracks.length,
        capped:rows.length===RUN_LIMIT||eligible.length>DETAIL_LIMIT},
      analyzedAt:new Date().toISOString(),
    },h)
  }catch(e){
    console.error('Garmin reference-route read:',e instanceof Error?e.message:'unavailable')
    return respond(503,{error:'Reference-route analysis temporarily unavailable'},h)
  }
})

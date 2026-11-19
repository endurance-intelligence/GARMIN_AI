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
    // Preselect by coarse GPS endpoints before transferring any high-volume
    // sample arrays. No analysis on non-repeating metadata candidates.
    const eligible=candidateIds(rows)
    const chosen=eligible.slice(0,DETAIL_LIMIT)
    const details:unknown[]=[]
    for(let i=0;i<chosen.length;i+=15){
      const batch=chosen.slice(i,i+15)
      const response=await db.from('garmin_activity_details')
        .select('activity_id,status,samples').in('activity_id',batch)
      if(response.error)throw Error('Garmin sample read '+response.error.code)
      details.push(...(response.data||[]))
    }
    const result=buildReferenceRoutes(rows,
      details as {activity_id:string;status:string;samples:unknown[]}[])
    return respond(200,{
      ...result,
      source:'Garmin · gespeicherte Laufdaten · letzter 24-Monats-Zeitraum',
      scan:{runningRead:rows.length,metadataCandidates:eligible.length,
        samplesExamined:details.length,
        capped:rows.length===RUN_LIMIT||eligible.length>DETAIL_LIMIT},
      analyzedAt:new Date().toISOString(),
    },h)
  }catch(e){
    console.error('Garmin reference-route read:',e instanceof Error?e.message:'unavailable')
    return respond(503,{error:'Reference-route analysis temporarily unavailable'},h)
  }
})

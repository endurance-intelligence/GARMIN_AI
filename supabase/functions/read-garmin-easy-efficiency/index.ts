/**
 * Read-only, owner-authenticated actual Garmin FIT speed/HR comparisons.
 * One completed ISO week per request; no raw FIT, GPS or identity returned.
 * Never authorizes workouts or estimates laboratory running economy.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {screenEasyPaceRun} from '../_shared/aerobic-pace.mjs'

const project=Deno.env.get('SUPABASE_URL')||''
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const isDev=(origin:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
function key(kind:'public'|'secret'){
 try{
  const k=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof k.default==='string'&&k.default)return k.default
 }catch{/* prior legacy key environment */}
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
const day=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const shift=(s:string,n:number)=>
 new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
function berlinToday(){
 const d=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const part=(k:string)=>d.find(x=>x.type===k)?.value||''
 return part('year')+'-'+part('month')+'-'+part('day')
}
type Activity={activity_id:string;start_time_local:string;sport_type:string;
 distance_m:number|null;duration_s:number|null;raw_activity:Record<string,unknown>|null;
 rpe_raw:number|null;feeling_raw:number|null}
type Detail={activity_id:string;fit_status:string;fit_record_count:number|null}
type Chunk={activity_id:string;chunk_index:number;records:unknown[]}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return respond(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET')return respond(405,{error:'Read-only'},h)
 if(!owner||!project||!key('public')||!key('secret'))
  return respond(503,{error:'Private Garmin efficiency analysis unavailable'},h)
 const token=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!token)return respond(401,{error:'Login required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await auth.auth.getUser(token[1])
  if(authError||!user)return respond(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return respond(403,{error:'Owner only'},h)
  const start=new URL(req.url).searchParams.get('start')||''
  if(!day(start)||new Date(start+'T12:00:00Z').getUTCDay()!==1)
   return respond(422,{error:'Expected ISO Monday'},h)
  const today=berlinToday(),end=shift(start,7)
  if(start<shift(today,-180)||end>today)
   return respond(422,{error:'Only prior completed Garmin weeks supported'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const activities=await db.from('garmin_activities')
   .select('activity_id,start_time_local,sport_type,distance_m,duration_s,rpe_raw,feeling_raw,raw_activity')
   .gte('start_time_local',start).lt('start_time_local',end)
   .eq('sport_type','running').order('start_time_local').limit(26)
  if(activities.error)return respond(503,{error:'Running activities unavailable'},h)
  const rows=(activities.data||[]) as Activity[]
  if(rows.length>25)return respond(422,{error:'Week exceeds bounded running scan'},h)
  const eligibleMetadata=rows.filter(a=>
   Number.isFinite(a.distance_m)&&Number.isFinite(a.duration_s)&&
   a.distance_m!>=5000&&a.distance_m!<=16000&&
   a.duration_s!>=2100&&a.duration_s!<=7200)
  const ids=eligibleMetadata.map(a=>String(a.activity_id))
  const details=ids.length?await db.from('garmin_activity_details')
   .select('activity_id,fit_status,fit_record_count').in('activity_id',ids):{data:[],error:null}
  if(details.error)return respond(503,{error:'FIT metadata unavailable'},h)
  const detailMap=new Map((details.data||[] as Detail[]).map(d=>[String(d.activity_id),d]))
  const fitCandidates=ids.filter(id=>{
   const d=detailMap.get(id)
   return d?.fit_status==='complete'&&
    Number.isInteger(d.fit_record_count)&&d.fit_record_count!>=250&&d.fit_record_count!<=20000
  })
  let chunks:Chunk[]=[]
  if(fitCandidates.length){
   const r=await db.from('garmin_fit_record_chunks')
    .select('activity_id,chunk_index,records').in('activity_id',fitCandidates)
    .order('activity_id',{ascending:true}).order('chunk_index',{ascending:true}).limit(201)
   if(r.error)return respond(503,{error:'FIT samples unavailable'},h)
   if((r.data||[]).length>200)
    return respond(503,{error:'FIT sample limit reached; weekly report incomplete'},h)
   chunks=(r.data||[]) as Chunk[]
  }
  const byId=new Map<string,unknown[][]>()
  for(const row of chunks){
   const list=byId.get(String(row.activity_id))||[]
   list.push(Array.isArray(row.records)?row.records:[])
   byId.set(String(row.activity_id),list)
  }
  const reasons:Record<string,number>={}
  const qualified=[]
  for(const a of rows){
   const id=String(a.activity_id),detail=detailMap.get(id)
   const series=byId.get(id)||[]
   const count=series.reduce((n,x)=>n+x.length,0)
   let outcome
   if(!detail||detail.fit_status!=='complete'||
    !Number.isInteger(detail.fit_record_count)||
    detail.fit_record_count!==count)
    outcome={qualified:false,reason:'fit-not-complete'}
   else{
    const elevation=a.raw_activity?.elevationGain
    outcome=screenEasyPaceRun({
     chunks:series,durationS:a.duration_s,distanceM:a.distance_m,
     elevationGainM:typeof elevation==='number'?elevation:null,
     rpeRaw:a.rpe_raw,feelingRaw:a.feeling_raw
    })
   }
   if(!outcome.qualified){
    const reason=String(outcome.reason||'unknown')
    reasons[reason]=(reasons[reason]||0)+1
    continue
   }
   // Only derived private, aggregate pace/HR evidence. No identity, raw FIT,
   // GPS, Garmin activity ID, activity name or personal location in the response.
   qualified.push({date:String(a.start_time_local||'').slice(0,10),
    distanceBand:outcome.distanceBand,gainMPerKm:outcome.gainMPerKm,
    rpe:outcome.rpe,validSeconds:outcome.validSeconds,
    coveragePercent:outcome.coveragePercent,speedCv:outcome.speedCv,bins:outcome.bins})
  }
  return respond(200,{start,end,readOnly:true,kind:'observed-pace-at-HR',
   totalRunning:rows.length,eligible:qualified.length,
   excluded:rows.length-qualified.length,reasons,runs:qualified,
   caveat:'Same Garmin HR is not equivalent to equal physiology or verified laboratory running economy.'},h)
 }catch(e){
  console.error('private aerobic evidence unavailable',e instanceof Error?e.name:'error')
  return respond(503,{error:'Private aerobic analysis temporarily unavailable'},h)
 }
})

/**
 * Single-athlete, read-only weekly FIT HR time histogram.
 * Uses the existing owner-only Supabase tables. Returns seconds grouped by
 * integer HR, never raw FIT samples, location, timestamps, IDs or credentials.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {sumRecordedHrSeconds,mergeTimeHistograms} from '../_shared/garmin-time-weighted.mjs'

const project=Deno.env.get('SUPABASE_URL')||''
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const runs=['running','track_running','treadmill_running','trail_running','ultra_run']
function key(kind:'public'|'secret'){
 try{
  const x=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof x.default==='string'&&x.default)return x.default
 }catch{/* legacy keys */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const isDev=(origin:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
function headers(origin:string|null){
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Methods':'GET,OPTIONS',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const response=(status:number,obj:unknown,h:Record<string,string>)=>
 new Response(JSON.stringify(obj),{status,headers:h})
const validDay=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const add=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+
 n*86400000).toISOString().slice(0,10)
const berlinToday=()=>{
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=(t:string)=>p.find(x=>x.type===t)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
type Activity={activity_id:string;duration_s:number|null}
type Detail={activity_id:string;fit_status:string;fit_record_count:number|null}
type Chunk={activity_id:string;chunk_index:number;records:unknown[]}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return response(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET')return response(405,{error:'Read only'},h)
 if(!owner||!project||!key('public')||!key('secret'))
  return response(503,{error:'Private HR analysis unavailable'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return response(401,{error:'Login required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await auth.auth.getUser(bearer[1])
  if(authError||!user)return response(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return response(403,{error:'Owner only'},h)
  const url=new URL(req.url),start=url.searchParams.get('start')||''
  if(!validDay(start)||new Date(start+'T12:00:00Z').getUTCDay()!==1)
   return response(422,{error:'Expected ISO Monday'},h)
  const today=berlinToday()
  if(start<add(today,-180)||start>today)
   return response(422,{error:'Historical week outside range'},h)
  const finish=add(start,7)
  if(finish>today)return response(422,{error:'Only completed weeks supported'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const activities=await db.from('garmin_activities')
   .select('activity_id,duration_s').gte('start_time_local',start)
   .lt('start_time_local',finish).in('sport_type',runs).order('start_time_local')
   .limit(41)
  if(activities.error)return response(503,{error:'Garmin activities unavailable'},h)
  const list=(activities.data||[]) as Activity[]
  if(list.length>40)return response(422,{error:'Too many activities for bounded weekly analysis'},h)
  const ids=list.map(a=>String(a.activity_id))
  const zero={start,finish,source:'Recorded Garmin FIT HR / elapsed time',
   mode:'measured seconds, gaps excluded, no LT1/LT2 inference',
   ...mergeTimeHistograms([]),readOnly:true}
  if(!ids.length)return response(200,zero,h)
  const details=await db.from('garmin_activity_details')
   .select('activity_id,fit_status,fit_record_count').in('activity_id',ids)
  if(details.error)return response(503,{error:'Garmin FIT metadata unavailable'},h)
  const byId=new Map((details.data||[] as Detail[]).map(d=>[String(d.activity_id),d]))
  const withFit=ids.filter(id=>{
   const detail=byId.get(id)
   return detail?.fit_status==='complete'&&
    Number.isInteger(detail.fit_record_count)&&
    detail.fit_record_count!>=80&&detail.fit_record_count!<=100000
  })
  let chunks:Chunk[]=[]
  if(withFit.length){
   const result=await db.from('garmin_fit_record_chunks')
    .select('activity_id,chunk_index,records').in('activity_id',withFit)
    .order('activity_id',{ascending:true})
    .order('chunk_index',{ascending:true}).limit(1001)
   if(result.error)return response(503,{error:'Garmin FIT records unavailable'},h)
   if((result.data||[]).length>1000)
    return response(503,{error:'Weekly FIT record limit reached'},h)
   chunks=(result.data||[]) as Chunk[]
  }
  const grouped=new Map<string,unknown[][]>()
  for(const c of chunks){
   const id=String(c.activity_id)
   const arr=grouped.get(id)||[]
   arr.push(Array.isArray(c.records)?c.records:[])
   grouped.set(id,arr)
  }
  const assessments=list.map(a=>{
   const id=String(a.activity_id),rows=grouped.get(id)||[]
   const count=rows.reduce((n,chunk)=>n+chunk.length,0)
   const detail=byId.get(id)
   if(!detail||!Number.isInteger(detail.fit_record_count)||
    detail.fit_record_count!==count)
    return {eligible:false}
   return sumRecordedHrSeconds(rows,a.duration_s)
  })
  return response(200,{start,finish,source:'Recorded Garmin FIT HR / elapsed time',
   mode:'measured seconds, gaps excluded, no LT1/LT2 inference',
   ...mergeTimeHistograms(assessments),readOnly:true},h)
 }catch(e){
  console.error('garmin-hourly-zone read:',e instanceof Error?e.message:'unavailable')
  return response(503,{error:'Private Garmin HR seconds unavailable'},h)
 }
})

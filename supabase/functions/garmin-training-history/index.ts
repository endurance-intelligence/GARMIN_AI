/** Owner-only monthly training history and append-only weekly plan versions.
 * Never publishes workouts or creates extra Garmin / Intervals requests.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function key(kind:'public'|'secret'){
 try{
  const data=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof data.default==='string'&&data.default)return data.default
 }catch{/* legacy fallback */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const isDev=(x:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(x)
function headers(origin:string|null){
 const allow=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
 'X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 ...(allow?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const reply=(status:number,data:unknown,h:Record<string,string>)=>new Response(JSON.stringify(data),{status,headers:h})
function validDate(s:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false
 const d=new Date(s+'T12:00:00Z')
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s
}
const plusDays=(date:string,days:number)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)
function berlinToday(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const val=(k:string)=>p.find(x=>x.type===k)?.value||''
 return val('year')+'-'+val('month')+'-'+val('day')
}
const validId=(id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const finite=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max
const isoMonday=(date:string)=>plusDays(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7))
const sports=['running','rowing','strength','cycling','football','hiking','other']
function snapshotValid(s:unknown,today:string){
 if(!object(s)||s.schema!==1||typeof s.weekStart!=='string'||!validDate(s.weekStart)||isoMonday(s.weekStart)!==s.weekStart||s.weekStart<isoMonday(today)||s.weekStart>plusDays(today,42))return false
 if(typeof s.phase!=='string'||s.phase.length>100||!(s.goalName===null||typeof s.goalName==='string'&&s.goalName.length<=160)||typeof s.partial!=='boolean')return false
 if(s.target!==null&&(!object(s.target)||!finite(s.target.low,500)||!finite(s.target.high,500)||Number(s.target.low)>Number(s.target.high)))return false
 const start=s.weekStart,end=plusDays(start,6)
 return Array.isArray(s.entries)&&s.entries.length<=40&&s.entries.every(e=>object(e)&&typeof e.date==='string'&&validDate(e.date)&&e.date>=start&&e.date<=end&&sports.includes(String(e.kind))&&typeof e.title==='string'&&e.title.length<=160&&['draft','approved','selected','coach'].includes(String(e.source))&&(e.minutes===null||finite(e.minutes,1440))&&(e.km===null||finite(e.km,500)))
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))return reply(503,{error:'Private training history unavailable'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Sign in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return reply(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)return reply(403,{error:'Not authorized'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}}),today=berlinToday()
  if(req.method==='POST'){
   const raw=await req.text()
   if(raw.length>30000)return reply(413,{error:'Snapshot too large'},h)
   let body:unknown
   try{body=JSON.parse(raw)}catch{return reply(422,{error:'Invalid JSON'},h)}
   if(!object(body)||!validId(body.requestId)||!snapshotValid(body.snapshot,today))return reply(422,{error:'Invalid current or future week snapshot'},h)
   const s=body.snapshot as Record<string,unknown>
   // The first and all later explicit plan versions are immutable. Idempotent retry.
   const row={user_id:user.id,week_start:s.weekStart,request_id:body.requestId,snapshot:{schema:1,weekStart:s.weekStart,phase:s.phase,goalName:s.goalName,target:s.target,entries:s.entries,partial:String(s.weekStart)<today}}
   const saved=await db.from('garmin_weekly_plan_history').insert(row).select('id,week_start,created_at,snapshot').single()
   if(saved.error?.code==='23505'){
    const previous=await db.from('garmin_weekly_plan_history').select('id,week_start,created_at,snapshot').eq('user_id',user.id).eq('request_id',body.requestId).single()
    if(previous.error||!previous.data||previous.data.week_start!==s.weekStart)return reply(409,{error:'Request conflict'},h)
    return reply(200,{revision:previous.data},h)
   }
   if(saved.error)return reply(503,{error:'Plan version could not be saved'},h)
   return reply(201,{revision:saved.data},h)
  }
  const month=new URL(req.url).searchParams.get('month')||''
  if(!/^\d{4}-\d{2}$/.test(month)||!validDate(month+'-01')||month<'2000-01'||month>plusDays(today,70).slice(0,7))return reply(422,{error:'Invalid month'},h)
  const start=month+'-01',next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1,12)).toISOString().slice(0,10)
  const from=isoMonday(start),to=plusDays(isoMonday(plusDays(next,-1)),7)
  const [activities,manual,revisions]=await Promise.all([
   db.from('garmin_activities').select('activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s').gte('start_time_local',from).lt('start_time_local',to).order('start_time_local').limit(1000),
   db.from('garmin_cross_training_sessions').select('id,session_date,kind,duration_minutes').eq('user_id',user.id).gte('session_date',from).lt('session_date',to).order('session_date').limit(1000),
   db.from('garmin_weekly_plan_history').select('id,week_start,created_at,snapshot').eq('user_id',user.id).gte('week_start',from).lt('week_start',to).order('created_at').limit(1000)
  ])
  if(activities.error||manual.error||revisions.error)return reply(503,{error:'Training history unavailable'},h)
  if([activities.data,manual.data,revisions.data].some(a=>!a||a.length>=1000))return reply(503,{error:'History exceeds safe query limit'},h)
  return reply(200,{month,today,activities:activities.data,manual:manual.data,revisions:revisions.data},h)
 }catch{return reply(503,{error:'Private training history unavailable'},h)}
})

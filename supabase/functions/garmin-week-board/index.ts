/** Read-only, single-athlete weekly activity and daily recovery evidence.
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
 'X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,OPTIONS',
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
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET')return reply(405,{error:'Read only'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Private week board unavailable'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Sign in required'},h)
 try{
  const client=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await client.auth.getUser(bearer[1])
  if(error||!user)return reply(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return reply(403,{error:'Not authorized'},h)
  const url=new URL(req.url),start=url.searchParams.get('start')||''
  if(!validDate(start)||new Date(start+'T12:00:00Z').getUTCDay()!==1)
   return reply(422,{error:'Expected ISO week start (Monday)'},h)
  const today=berlinToday()
  const earliest=plusDays(today,-180),latest=plusDays(today,180)
  if(start<earliest||start>latest)return reply(422,{error:'Week outside supported range'},h)
  const end=plusDays(start,7)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const [activities,health,manual]=await Promise.all([
   db.from('garmin_activities').select(
     'activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw')
    .gte('start_time_local',start).lt('start_time_local',end)
    .order('start_time_local',{ascending:true}).limit(250),
   db.from('garmin_daily_metrics').select(
     'metric_date,hrv_ms,resting_heart_rate,sleep_seconds,stress_avg,body_battery_max,synced_at')
    .gte('metric_date',start).lt('metric_date',end).order('metric_date',{ascending:true}).limit(7),
   db.from('garmin_cross_training_sessions').select(
     'id,session_date,kind,duration_minutes,rowing_distance_m,rpe')
    .eq('user_id',user.id).gte('session_date',start).lt('session_date',end)
    .order('session_date',{ascending:true}).limit(80)
  ])
  if(activities.error||health.error||manual.error)
   return reply(503,{error:'Garmin weekly evidence unavailable'},h)
  // Limit response to explicitly selected fields; never return raw FIT
  // streams, provider credentials or personal user identifiers.
  return reply(200,{
   timezone:'Europe/Berlin',start,endExclusive:end,
   activities:activities.data||[],health:health.data||[],
   manual:(manual.data||[]).map((x)=>({
    id:x.id,session_date:x.session_date,kind:x.kind,
    duration_minutes:x.duration_minutes,rowing_distance_m:x.rowing_distance_m,rpe:x.rpe
   })),
   summary:{isDerivedFromActualActivities:true,proprietaryTrainingLoadScore:false},
   ownerOnly:true
  },h)
 }catch{return reply(503,{error:'Private week board unavailable'},h)}
})

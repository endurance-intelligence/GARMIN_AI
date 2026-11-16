/** GARMIN_AI v0.9.61: owner-only read-only coach review, not a training permission. */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {buildActivityCoach,buildWeeklyCoach} from './coachReview.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const dateRule=/^\d{4}-\d{2}-\d{2}$/
const isDev=(s:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(s)
function key(kind:'public'|'secret'){
 try{
  const raw=Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}'
  const found=JSON.parse(raw)
  if(typeof found.default==='string'&&found.default)return found.default
 }catch{/* preserve legacy key fallback */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
function headers(origin:string|null){
 const allow=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'GET,OPTIONS',
  ...(allow?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const reply=(status:number,data:unknown,h:Record<string,string>)=>new Response(JSON.stringify(data),{status,headers:h})
function addDays(day:string,days:number){
 return new Date(Date.parse(day+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)
}
function monday(day:string){
 const d=new Date(day+'T12:00:00Z').getUTCDay()
 return addDays(day,-((d+6)%7))
}
function dayValid(day:string){
 return dateRule.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&
  new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day
}
const running=(sport:string|null)=>/run|jog|trail|treadmill/i.test(sport||'')

Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET')return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Private coach review unavailable'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Sign-in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await auth.auth.getUser(bearer[1])
  if(userError||!user)return reply(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return reply(403,{error:'Not authorized'},h)
  const admin=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const url=new URL(req.url)
  const id=url.searchParams.get('id')
  let start=url.searchParams.get('start')||''
  if(id!==null){
   if(!/^\d{6,20}$/.test(id))return reply(400,{error:'Invalid activity ID'},h)
   const {data:one,error:oneError}=await admin.from('garmin_activities')
    .select('activity_id,start_time_local,sport_type').eq('activity_id',id).maybeSingle()
   if(oneError)throw oneError
   if(!one||!running(one.sport_type))return reply(404,{error:'Run not found'},h)
   start=monday(String(one.start_time_local||'').slice(0,10))
  }
  if(!dayValid(start))return reply(400,{error:'A valid week start is required'},h)
  // One 14-day window: preceding week + selected week. No unnecessary downloads.
  const from=addDays(start,-7),until=addDays(start,7)
  const {data:activities,error:activityError}=await admin.from('garmin_activities')
   .select('activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw')
   .gte('start_time_local',from).lt('start_time_local',until)
   .order('start_time_local',{ascending:false}).limit(140)
  if(activityError)throw activityError
  const runs=(activities||[]).filter(a=>running(a.sport_type)).slice(0,75)
  const runIds=runs.map(a=>String(a.activity_id))
  const details:Record<string,unknown>={}
  if(runIds.length){
   const {data:rows,error:detailsError}=await admin.from('garmin_activity_details')
    .select('activity_id,fit_status,fit_laps,fit_workout_steps,fit_quality,fit_terrain')
    .in('activity_id',runIds)
   if(detailsError)throw detailsError
   for(const row of rows||[])details[String(row.activity_id)]=row
  }
  const {data:goal,error:goalError}=await admin.from('garmin_coach_goals')
   .select('race_name,race_date,distance_km,target_hours').eq('user_id',user.id).maybeSingle()
  if(goalError)throw goalError
  const reviews=runs.filter(a=>String(a.start_time_local||'').slice(0,10)>=start)
   .map(a=>buildActivityCoach(a,details[String(a.activity_id)]||{},goal||null))
   .filter(Boolean)
  const week=buildWeeklyCoach(activities||[],details,goal||null,start)
  return reply(200,{source:'Garmin FIT · read-only',week,goal:goal||null,reviews,updatedAt:new Date().toISOString()},h)
 }catch(error){
  console.error('Private Garmin coach review failed:',error instanceof Error?error.message:'unknown')
  return reply(502,{error:'Coach-Auswertung momentan nicht verfügbar'},h)
 }
})
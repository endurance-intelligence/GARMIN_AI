/** GARMIN_AI v0.9.64: owner-only, READ-ONLY Intervals.icu training context. */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {runningSportSettings,wellnessTrend,matchOneGarminActivity,activityEvidence} from './intervalsInsights.mjs'
import {activityLoadComparison,weekLoadComparison,loadCoachFinding} from './loadComparison.mjs'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const isDev=(s:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(s)
const allowed=(o:string)=>o==='https://endurance-intelligence.github.io'||isDev(o)
const originHeaders=(origin:string|null)=>({
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
 'X-Content-Type-Options':'nosniff', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods':'GET,OPTIONS',
 ...(origin&&allowed(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})
})
const json=(status:number,data:unknown,headers:Record<string,string>)=>new Response(JSON.stringify(data),{status,headers})
function key(mode:'public'|'secret'){
 const k=mode==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
 try{const obj=JSON.parse(Deno.env.get(k)||'{}');if(typeof obj.default==='string'&&obj.default)return obj.default}catch{}
 return Deno.env.get(mode==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const validDay=(s:string)=>/^\d{4}-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const dayAdd=(s:string,n:number)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const monday=(s:string)=>dayAdd(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7))
const berlinToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
async function remote(path:string,secret:string){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8500)
 try{
  // Paths are constructed internally from fixed allowlisted endpoints and validated ISO dates/IDs.
  const res=await fetch('https://intervals.icu/api/v1'+path,{
   method:'GET',cache:'no-store',redirect:'error',signal:controller.signal,
   headers:{Authorization:'Basic '+btoa('API_KEY:'+secret),Accept:'application/json'}
  })
  if(!res.ok)throw Error('HTTP '+res.status)
  return await res.json()
 }finally{clearTimeout(timeout)}
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=originHeaders(origin)
 if(origin&&!allowed(origin))return json(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET')return json(405,{error:'Read only'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return json(503,{error:'Private Intervals context not configured'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return json(401,{error:'Sign-in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:userError}=await auth.auth.getUser(bearer[1])
  if(userError||!user)return json(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return json(403,{error:'Not authorized'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const url=new URL(req.url)
  const id=url.searchParams.get('id'),startParam=url.searchParams.get('start')
  if(id!==null&&!/^\d{6,20}$/.test(id))return json(422,{error:'Invalid Garmin activity ID'},h)
  let garmin=null
  if(id!==null){
   const {data,error}=await db.from('garmin_activities').select('activity_id,start_time_local,distance_m,sport_type')
    .eq('activity_id',id).maybeSingle()
   if(error)throw error
   if(!data||!/run|jog|trail|treadmill/i.test(data.sport_type||''))return json(404,{error:'Run not found'},h)
   garmin=data
  }
  const start=garmin?monday(String(garmin.start_time_local).slice(0,10)):startParam||''
  if(!validDay(start))return json(422,{error:'Valid week start required'},h)
  const earliest=dayAdd(start,-56),latest=dayAdd(start,6)
  const {data:connection,error:connError}=await db.from('garmin_intervals_connection')
   .select('connected_at').eq('user_id',user.id).maybeSingle()
  if(connError)throw connError
  if(!connection)return json(200,{connected:false,zones:null,trend:null,activity:null,availability:{profile:false,wellness:false,activity:false}},h)
  const {data:secret,error:secretError}=await db.rpc('garmin_intervals_key_get',{p_user_id:user.id})
  if(secretError||typeof secret!=='string'||!secret)return json(503,{error:'Secure Intervals credential unavailable'},h)
  // Load comparisons use recorded Intervals activities only; missing imports are
  // UNKNOWN, not a zero-load week. Same list supports unique Garmin matching.
  const query=new URLSearchParams({oldest:earliest,newest:latest})
  const remoteRequests=[
   remote('/athlete/0',secret),
   remote('/athlete/0/wellness?'+query,secret),
   remote('/athlete/0/activities?'+new URLSearchParams({oldest:earliest,newest:latest,limit:'300'}),secret)
  ]
  const settled=await Promise.allSettled(remoteRequests)
  const body=i=>settled[i]?.status==='fulfilled'?settled[i].value:null
  const profile=body(0),wellness=body(1),remoteActivities=body(2)
  const zones=runningSportSettings(profile)
  const asOf=garmin?String(garmin.start_time_local).slice(0,10):
   (latest<berlinToday()?latest:berlinToday())
  const trend=wellnessTrend(wellness,earliest,asOf)
  const match=garmin?matchOneGarminActivity(garmin,remoteActivities):null
  let activity=null
  if(match&&typeof match.id==='string'&&/^[a-zA-Z0-9_:-]{1,80}$/.test(match.id)){
   try{const data=await remote('/activity/'+encodeURIComponent(match.id)+'?intervals=true',secret)
    activity=activityEvidence(match,data)
   }catch{activity=activityEvidence(match,null)}
  }
  const {data:goal}=await db.from('garmin_coach_goals').select('race_name,race_date')
   .eq('user_id',user.id).maybeSingle()
  const race=goal&&typeof goal.race_date==='string'?goal:null
  const activityComparison=garmin&&activity?.load!==null&&activity?.load!==undefined?
   activityLoadComparison(remoteActivities,activity.load,asOf):null
  const weekComparison=weekLoadComparison(remoteActivities,start,berlinToday())
  const loadContext={
   activity:activityComparison,week:weekComparison,
   activityFinding:loadCoachFinding(activityComparison,'activity',race,asOf),
   weekFinding:loadCoachFinding(weekComparison,'week',race,dayAdd(weekComparison?.weekStart||start,6)),
   // Coverage metadata prevents false assumptions of a complete import.
   historyAvailable:Array.isArray(remoteActivities),
   historyWindowDays:56
  }
  // No raw source workouts/IDs, GPS, user email, credentials or wellness rows.
  return json(200,{connected:true,zones,trend,activity,loadContext,
   availability:{profile:!!profile,wellness:Array.isArray(wellness),activity:Array.isArray(remoteActivities)},
   source:'Intervals.icu · Zusatzkontext, Garmin bleibt Primärquelle',
   warnings:settled.map((x,i)=>x.status==='rejected'?['zones','fitness','activity'][i]+' unavailable':null).filter(Boolean)},h)
 }catch(e){console.error('Owner Intervals context failed:',e instanceof Error?e.message:'unknown')
  return json(502,{error:'Intervals context temporarily unavailable'},h)}
})
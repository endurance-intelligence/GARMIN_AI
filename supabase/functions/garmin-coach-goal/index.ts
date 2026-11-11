/** Owner-only editable athlete race goal. Personal Garmin API remains read-only.
 * All recommendations and calendar writes require separate athlete approval.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const isDev=(x:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(x)
function key(kind:'public'|'secret'){
 try{
  const v=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof v.default==='string'&&v.default)return v.default
 }catch{}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
function cors(origin:string|null){
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
 'X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
function response(code:number,data:unknown,headers:Record<string,string>){
 return new Response(JSON.stringify(data),{status:code,headers})
}
function dateValid(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false
 const d=new Date(v+'T12:00:00Z')
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v
}
const finite=(x:unknown,min:number,max:number)=>
 typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=cors(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return response(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET'&&req.method!=='POST')return response(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return response(503,{error:'Coach goal service unavailable'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return response(401,{error:'Sign in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return response(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return response(403,{error:'Not authorized'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  if(req.method==='GET'){
   const {data,error}=await db.from('garmin_coach_goals')
    .select('race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at')
    .eq('user_id',user.id).maybeSingle()
   if(error)return response(503,{error:'Goal not available'},h)
   return response(200,{goal:data||null,phaseCalculated:true,autoSchedule:false},h)
  }
  const raw=await req.text()
  if(raw.length>4000)return response(413,{error:'Request too large'},h)
  let input:unknown
  try{input=JSON.parse(raw)}catch{return response(422,{error:'Invalid JSON'},h)}
  if(!input||typeof input!=='object'||Array.isArray(input))return response(422,{error:'Invalid goal'},h)
  const v=input as Record<string,unknown>
  if(v.action!=='save'||v.confirm!==true||
    typeof v.raceName!=='string'||v.raceName.trim().length<3||v.raceName.length>100||
    !dateValid(v.raceDate)||!finite(v.distanceKm,1,500)||
    !(v.targetHours===null||finite(v.targetHours,0.1,100))||
    typeof v.raceLocation!=='string'||v.raceLocation.length>120||
    typeof v.coachNote!=='string'||v.coachNote.length>600||
    !(v.raceStartTime===null||
      (typeof v.raceStartTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.raceStartTime))))
   return response(422,{error:'Bitte Ziel und Wettkampfdatum prüfen.'},h)
  const saved={
   user_id:user.id,race_name:v.raceName.trim(),race_date:v.raceDate,
   distance_km:v.distanceKm,target_hours:v.targetHours,
   race_location:v.raceLocation.trim(),race_start_time:v.raceStartTime,
   coach_note:v.coachNote.trim(),updated_at:new Date().toISOString()
  }
  const {data,error:saveError}=await db.from('garmin_coach_goals')
   .upsert(saved,{onConflict:'user_id'})
   .select('race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at')
   .single()
  if(saveError||!data)return response(503,{error:'Ziel konnte nicht gespeichert werden.'},h)
  return response(200,{saved:true,goal:data,garminChanged:false,intervalsChanged:false,
   trainingPlanChanged:false},h)
 }catch{return response(503,{error:'Coach goal service unavailable'},h)}
})

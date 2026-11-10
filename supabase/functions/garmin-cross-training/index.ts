/**
 * GARMIN_AI v0.9.27 – private cross-training context and manual session notes.
 * Garmin is read-only and primary; record manual sessions only on direct action.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function key(kind:'public'|'secret'){
 try{
  const data=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof data.default==='string'&&data.default)return data.default
 }catch{/* Legacy supported */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const isDev=(o:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(o)
const headers=(origin:string|null)=>{
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const reply=(status:number,data:unknown,h:Record<string,string>)=>new Response(JSON.stringify(data),{status,headers:h})
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
function berlinToday(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=(k:string)=>p.find(x=>x.type===k)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
const isDate=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const kinds=['strength','mobility','rowing']
const sportTypes=['soccer','indoor_rowing','strength_training','mobility']
const sportMap:Record<string,string>={strength:'strength_training',mobility:'mobility',rowing:'indoor_rowing'}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin denied'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Cross-training access not configured'},h)
 const token=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!token)return reply(401,{error:'Sign in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await auth.auth.getUser(token[1])
  if(authError||!user)return reply(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.toLowerCase().trim()!==owner)
   return reply(403,{error:'Owner only'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const today=berlinToday()
  const earliest=new Date(Date.parse(today+'T12:00:00Z')-100*86400000).toISOString().slice(0,10)
  if(req.method==='GET'){
   const [manual,garmin]=await Promise.all([
    db.from('garmin_cross_training_sessions')
      .select('id,session_date,kind,duration_minutes,rowing_distance_m,rpe,exercise_ids,note,created_at')
      .eq('user_id',user.id).gte('session_date',earliest).order('session_date',{ascending:false}).limit(100),
    db.from('garmin_activities')
      .select('activity_id,activity_name,start_time_local,sport_type,duration_s,distance_m,average_heart_rate,rpe_raw')
      .in('sport_type',sportTypes).gte('start_time_local',earliest).order('start_time_local',{ascending:false}).limit(150)
   ])
   if(manual.error||garmin.error)return reply(503,{error:'Cross-training context unavailable'},h)
   return reply(200,{manual:manual.data||[],garmin:garmin.data||[],
    source:'Garmin Personal API + manually confirmed complementary workouts',
    automaticTrainingChanges:false},h)
  }
  const body=await req.text()
  if(body.length>4000)return reply(413,{error:'Payload too large'},h)
  let input:unknown
  try{input=JSON.parse(body)}catch{return reply(422,{error:'Invalid JSON'},h)}
  if(!input||typeof input!=='object'||Array.isArray(input))return reply(422,{error:'Invalid body'},h)
  const p=input as Record<string,unknown>
  const date=p.date,kind=p.kind,duration=p.durationMinutes,dist=p.distanceMeters,
   rpe=p.rpe,ids=p.exerciseIds,note=p.note
  if(p.action!=='log'||!uuid(p.clientRequestId)||!isDate(date)||date>today||
     date<new Date(Date.parse(today+'T12:00:00Z')-30*86400000).toISOString().slice(0,10)||
     !kinds.includes(String(kind))||!Number.isSafeInteger(duration)||Number(duration)<5||Number(duration)>240||
     (rpe!==null&&rpe!==undefined&&(!Number.isSafeInteger(rpe)||Number(rpe)<1||Number(rpe)>10))||
     !Array.isArray(ids)||ids.length>26||ids.some(x=>typeof x!=='string'||!/^[a-z][a-z0-9-]{1,64}$/.test(x))||
     typeof note!=='string'||note.length>400)
    return reply(422,{error:'Ungültige Trainingseinheit'},h)
  if(kind!=='rowing'&&ids.length===0)return reply(422,{error:'Bitte mindestens eine Stabi-/Mobilitätsübung auswählen'},h)
  if(kind==='rowing'&&dist!==null&&dist!==undefined&&
     (!Number.isSafeInteger(dist)||Number(dist)<500||Number(dist)>100000))
    return reply(422,{error:'Ungültige Ruderstrecke'},h)
  if(kind!=='rowing'&&dist!==null&&dist!==undefined)
    return reply(422,{error:'Stabi und Mobility haben keine Distanz'},h)
  // Garmin-imported activities must not be silently double counted.
  const {data:garminAlready}=await db.from('garmin_activities')
   .select('activity_id').eq('sport_type',sportMap[String(kind)])
   .gte('start_time_local',date).lt('start_time_local',date+'T23:59:59').limit(1)
  if(garminAlready?.length&&p.confirmAdditional!==true)
    return reply(409,{error:'Garmin kennt bereits ein passendes Training an diesem Tag. Nicht doppelt erfassen – nur bei tatsächlich zusätzlicher Einheit ausdrücklich bestätigen.',
     duplicateGarmin:true},h)
  const {data:saved,error:writeError}=await db.from('garmin_cross_training_sessions')
   .upsert({user_id:user.id,client_request_id:p.clientRequestId,
    session_date:date,kind,duration_minutes:duration,
    rowing_distance_m:kind==='rowing'?(dist??null):null,rpe:rpe??null,
    exercise_ids:ids,note}, {onConflict:'client_request_id'})
   .select('id,session_date,kind,duration_minutes').maybeSingle()
  if(writeError||!saved)return reply(503,{error:'Training konnte nicht gespeichert werden'},h)
  return reply(200,{saved:true,session:saved,garminChanged:false,intervalsChanged:false},h)
 }catch{
  return reply(503,{error:'Cross-training temporarily unavailable'},h)
 }
})

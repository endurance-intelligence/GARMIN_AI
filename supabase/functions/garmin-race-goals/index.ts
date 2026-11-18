/** Additional races, one explicit primary goal for Coach. Owner-only API.
 * Atomically switch main through database function. No workout/Garmin writes.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const isDev=(x:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(x)
function key(kind:'public'|'secret'){
 try{const v=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof v.default==='string'&&v.default)return v.default}catch{}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
function cors(origin:string|null){
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private,no-store',
 'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
function reply(code:number,body:unknown,headers:Record<string,string>){
 return new Response(JSON.stringify(body),{status:code,headers})
}
function validDate(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false
 const d=new Date(v+'T12:00:00Z')
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v
}
function validGoal(v:Record<string,unknown>){
 return typeof v.raceName==='string'&&v.raceName.trim().length>=3&&v.raceName.length<=100&&
  validDate(v.raceDate)&&typeof v.distanceKm==='number'&&Number.isFinite(v.distanceKm)&&
  v.distanceKm>=0.1&&v.distanceKm<=500&&
  (v.targetHours===null||typeof v.targetHours==='number'&&Number.isFinite(v.targetHours)&&
   v.targetHours>0&&v.targetHours<=100)&&
  typeof v.raceLocation==='string'&&v.raceLocation.length<=120&&
  typeof v.coachNote==='string'&&v.coachNote.length<=600&&
  (v.raceStartTime===null||typeof v.raceStartTime==='string'&&
   /^([01]\d|2[0-3]):[0-5]\d$/.test(v.raceStartTime))
}
const fields='id,race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at'
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=cors(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Goals unavailable'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return reply(401,{error:'Sign-in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return reply(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return reply(403,{error:'Not authorized'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  if(req.method==='GET'){
   const [main,other]=await Promise.all([
    db.from('garmin_coach_goals').select('race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at').eq('user_id',user.id).maybeSingle(),
    db.from('garmin_coach_secondary_goals').select(fields).eq('user_id',user.id).order('race_date',{ascending:true}).limit(60)
   ])
   if(main.error||other.error)return reply(503,{error:'Wettkampfziele nicht verfügbar'},h)
   return reply(200,{primary:main.data,others:other.data||[],coachFollowsPrimary:true},h)
  }
  const body=await req.text()
  if(body.length>3000)return reply(413,{error:'Request too large'},h)
  let input:Record<string,unknown>
  try{const parsed=JSON.parse(body)
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid')
   input=parsed}catch{return reply(422,{error:'Ungültige Eingabe'},h)}
  if(input.confirm!==true)return reply(422,{error:'Bitte Änderung ausdrücklich bestätigen.'},h)
  if(input.action==='add'){
   if(!validGoal(input))return reply(422,{error:'Wettkampfdatum oder Zielangaben prüfen.'},h)
   const {data:existing}=await db.from('garmin_coach_goals').select('race_name,race_date').eq('user_id',user.id).maybeSingle()
   if(existing?.race_name===input.raceName?.toString().trim()&&existing?.race_date===input.raceDate)
    return reply(409,{error:'Dieses Rennen ist bereits dein Hauptziel.'},h)
   const row={user_id:user.id,race_name:String(input.raceName).trim(),
    race_date:input.raceDate,distance_km:input.distanceKm,target_hours:input.targetHours,
    race_location:String(input.raceLocation).trim(),race_start_time:input.raceStartTime,
    coach_note:String(input.coachNote).trim(),updated_at:new Date().toISOString()}
   const {data,error:saveError}=await db.from('garmin_coach_secondary_goals')
    .upsert(row,{onConflict:'user_id,race_name,race_date'}).select(fields).single()
   if(saveError||!data)return reply(503,{error:'Weiteres Ziel konnte nicht gespeichert werden.'},h)
   return reply(200,{saved:true,goal:data,primaryUnchanged:true},h)
  }
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(input.id||'')))
   return reply(422,{error:'Ungültige Zielkennung'},h)
  if(input.action==='promote'){
   const {data,error:promoteError}=await db.rpc('garmin_promote_race_goal',
    {p_user_id:user.id,p_secondary_id:input.id})
   if(promoteError)return reply(503,{error:'Hauptziel konnte nicht gewechselt werden.'},h)
   if(!data)return reply(404,{error:'Ziel nicht gefunden'},h)
   return reply(200,{promoted:true,previousPrimaryPreserved:true,garminChanged:false,intervalsChanged:false},h)
  }
  if(input.action==='remove'){
   const {data,error:removeError}=await db.from('garmin_coach_secondary_goals')
    .delete().eq('user_id',user.id).eq('id',input.id).select('id').maybeSingle()
   if(removeError)return reply(503,{error:'Ziel konnte nicht entfernt werden.'},h)
   if(!data)return reply(404,{error:'Ziel nicht gefunden'},h)
   return reply(200,{removed:true,primaryUnchanged:true},h)
  }
  return reply(422,{error:'Unbekannte Aktion'},h)
 }catch{return reply(503,{error:'Goal service unavailable'},h)}
})

/** Explicit user-entered test thresholds. No automatic LT1/LT2 inference.
 * Single athlete: confirmed Auth owner only, private database table, GET/POST
 * limited to test values, deletion requires explicit user confirmation.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project=Deno.env.get('SUPABASE_URL')||''
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const isDev=(s:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(s)
function key(kind:'public'|'secret'){
 try{
  const v=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof v.default==='string'&&v.default)return v.default
 }catch{/* Fall back to existing legacy keys. */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const cors=(origin:string|null)=>{
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const response=(status:number,value:unknown,headers:Record<string,string>)=>
 new Response(JSON.stringify(value),{status,headers})
const isDate=(x:unknown):x is string=>typeof x==='string'&&
 /^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+'T12:00:00Z'))&&
 new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x
const berlinToday=()=>{
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=(k:string)=>p.find(x=>x.type===k)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
const source=['lab_lactate','lab_ventilatory','field_test']
type Input={action?:unknown;confirm?:unknown;lt1?:unknown;lt2?:unknown;
 testedOn?:unknown;testType?:unknown;note?:unknown}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers=cors(origin)
 if(origin&&!headers['Access-Control-Allow-Origin'])
  return response(403,{error:'Origin not allowed'},headers)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(req.method!=='GET'&&req.method!=='POST')
  return response(405,{error:'Method not allowed'},headers)
 if(!project||!owner||!key('public')||!key('secret'))
  return response(503,{error:'Private threshold calibration unavailable'},headers)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return response(401,{error:'Sign in required'},headers)
 try{
  const auth=createClient(project,key('public'),{
   auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return response(401,{error:'Invalid session'},headers)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return response(403,{error:'Owner only'},headers)
  const db=createClient(project,key('secret'),{
   auth:{persistSession:false,autoRefreshToken:false}})
  const fields='lt1_bpm,lt2_bpm,tested_on,test_type,note,updated_at'
  if(req.method==='GET'){
   const {data,error}=await db.from('garmin_threshold_calibration')
    .select(fields).eq('user_id',user.id).maybeSingle()
   if(error)return response(503,{error:'Threshold data not available'},headers)
   return response(200,{calibration:data||null,ownerOnly:true,
    autoTrainingChanges:false},headers)
  }
  const text=await req.text()
  if(text.length>1800)return response(413,{error:'Request too large'},headers)
  let input:Input
  try{input=JSON.parse(text) as Input}catch{
   return response(422,{error:'Invalid JSON'},headers)}
  if(!input||typeof input!=='object'||Array.isArray(input)||
   input.confirm!==true)return response(422,{error:'Please explicitly confirm'},headers)
  if(input.action==='delete'){
   const {error:delError}=await db.from('garmin_threshold_calibration')
    .delete().eq('user_id',user.id)
   if(delError)return response(503,{error:'Could not delete threshold settings'},headers)
   return response(200,{saved:true,calibration:null,autoTrainingChanges:false},headers)
  }
  if(input.action!=='save'||!Number.isInteger(input.lt1)||
   !Number.isInteger(input.lt2)||Number(input.lt1)<70||Number(input.lt1)>195||
   Number(input.lt2)<95||Number(input.lt2)>220||
   Number(input.lt2)-Number(input.lt1)<8||
   !isDate(input.testedOn)||input.testedOn<'1990-01-01'||
   input.testedOn>berlinToday()||!source.includes(String(input.testType))||
   typeof input.note!=='string'||input.note.length>240)
   return response(422,{error:'Please check test date, source and LT1/LT2 heart rates'},headers)
  const row={
   user_id:user.id,lt1_bpm:input.lt1,lt2_bpm:input.lt2,
   tested_on:input.testedOn,test_type:input.testType,
   note:input.note.trim(),updated_at:new Date().toISOString()
  }
  const {data,error:saveError}=await db.from('garmin_threshold_calibration')
   .upsert(row,{onConflict:'user_id'}).select(fields).single()
  if(saveError||!data)return response(503,{error:'Could not save thresholds'},headers)
  return response(200,{saved:true,calibration:data,autoTrainingChanges:false,
   garminChanged:false,calendarChanged:false},headers)
 }catch(e){
  console.error('Threshold calibration unavailable',e instanceof Error?e.name:'error')
  return response(503,{error:'Private threshold calibration unavailable'},headers)
 }
})

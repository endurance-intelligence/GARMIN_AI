/**
 * GARMIN_AI v0.9.25: private weekly training opportunities.
 * Read-only reference schedule plus explicit per-week attendance choice.
 * NEVER schedules Garmin/Intervals events or changes coach training prescriptions.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function key(kind:'public'|'secret'){
 try{
  const data=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof data.default==='string'&&data.default)return data.default
 }catch{/* Legacy compatibility */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const isDev=(o:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(o)
const makeHeaders=(origin:string|null)=>{
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const reply=(status:number,data:unknown,headers:Record<string,string>)=>
 new Response(JSON.stringify(data),{status,headers})
function berlinToday(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const val=(kind:string)=>parts.find(x=>x.type===kind)?.value||''
 return val('year')+'-'+val('month')+'-'+val('day')
}
const validDate=(v:unknown):v is string=>typeof v==='string'&&
 /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&
 new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v
const offset=(day:string,count:number)=>new Date(Date.parse(day+'T12:00:00Z')+count*86400000).toISOString().slice(0,10)
const isoWeekday=(day:string)=>((new Date(day+'T12:00:00Z').getUTCDay()+6)%7)+1
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=makeHeaders(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin forbidden'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET'&&req.method!=='POST')return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Private weekly schedule not configured'},h)
 const authToken=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!authToken)return reply(401,{error:'Sign in first'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(authToken[1])
  if(error||!user)return reply(401,{error:'Invalid session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
    return reply(403,{error:'Not your schedule'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const today=berlinToday(),oldest=offset(today,-8),newest=offset(today,60)
  if(req.method==='GET'){
   const [options,choices]=await Promise.all([
    db.from('garmin_weekly_training_options')
      .select('code,weekday,start_time,timezone,title,sport,location_label,location_lat,location_lon,context_note,enabled,optional')
      .eq('enabled',true).order('weekday').order('start_time'),
    db.from('garmin_weekly_training_choices')
      .select('option_code,training_date,choice,updated_at')
      .gte('training_date',oldest).lte('training_date',newest).order('training_date')
   ])
   if(options.error||choices.error)return reply(503,{error:'Weekly training options unavailable'},h)
   return reply(200,{options:options.data||[],choices:choices.data||[],timezone:'Europe/Berlin',
    optional:true,autopublish:false,forecastProvider:'Open-Meteo'},h)
  }
  const raw=await req.text()
  if(raw.length>2000)return reply(413,{error:'Request too large'},h)
  let input:unknown
  try{input=JSON.parse(raw)}catch{return reply(422,{error:'Invalid request'},h)}
  if(!input||typeof input!=='object'||Array.isArray(input))
    return reply(422,{error:'Invalid data'},h)
  const row=input as Record<string,unknown>
  if(row.action!=='set_choice'||typeof row.code!=='string'||row.code.length>60||
      !validDate(row.date)||!['selected','skipped','open'].includes(String(row.choice)))
    return reply(422,{error:'Invalid training choice'},h)
  if(row.date<today||row.date>newest)
    return reply(422,{error:'Date outside selectable period'},h)
  const {data:option,error:optionError}=await db.from('garmin_weekly_training_options')
    .select('weekday,enabled').eq('code',row.code).maybeSingle()
  if(optionError||!option||!option.enabled||isoWeekday(row.date)!==option.weekday)
    return reply(422,{error:'Date does not match the recurring training slot'},h)
  if(row.choice==='open'){
   const {error:deleteError}=await db.from('garmin_weekly_training_choices')
    .delete().eq('option_code',row.code).eq('training_date',row.date)
   if(deleteError)return reply(503,{error:'Choice could not be reset'},h)
   return reply(200,{saved:true,code:row.code,date:row.date,choice:'open',garminChanged:false},h)
  }
  const {error:writeError}=await db.from('garmin_weekly_training_choices')
    .upsert({option_code:row.code,training_date:row.date,choice:row.choice,updated_at:new Date().toISOString()},
      {onConflict:'training_date,option_code'})
  if(writeError)return reply(503,{error:'Choice could not be saved'},h)
  return reply(200,{saved:true,code:row.code,date:row.date,choice:row.choice,
    garminChanged:false,intervalsChanged:false},h)
 }catch{
  return reply(503,{error:'Private weekly schedule temporarily unavailable'},h)
 }
})

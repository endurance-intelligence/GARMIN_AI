/** Owner-only Coach context: self-declared illness, gradual return and blocked days.
 * No symptoms, diagnoses or clinical data are inferred from Garmin activity.
 * No actions here create, approve or publish a training workout.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function key(kind:'public'|'secret'){
 try{
  const data=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof data.default==='string'&&data.default)return data.default
 }catch{/* legacy key */}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
const allowedOrigin=(o:string)=>o==='https://endurance-intelligence.github.io'||
 /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(o)
function headers(origin:string|null){
 const allowed=origin&&allowedOrigin(origin)
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const respond=(code:number,body:unknown,h:Record<string,string>)=>new Response(JSON.stringify(body),{status:code,headers:h})
const day=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 Number.isFinite(Date.parse(d+'T12:00:00Z'))&&
 new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const plusDays=(d:string,n:number)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const dayDiff=(start:string,end:string)=>Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)
function berlinToday(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=(k:string)=>p.find(x=>x.type===k)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
type Period={id:string;start:string;end:string;reason:'vacation'|'unavailable'}
type Review={activityId:string;assessment:'ok'|'concern';reviewedOn:string}
type Row={user_id:string;illness_state:'well'|'sick'|'returning';
 illness_started_on:string|null;return_started_on:string|null;
 blocked_periods:Period[];run_reviews:Review[];updated_at:string}
const empty=(id:string):Row=>({user_id:id,illness_state:'well',illness_started_on:null,
 return_started_on:null,blocked_periods:[],run_reviews:[],updated_at:new Date().toISOString()})
const isRun=(sport:unknown)=>typeof sport==='string'&&/run|jog|trail|treadmill/i.test(sport)
const activityFields='activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw'
type Run={activity_id:string;activity_name:string|null;start_time_local:string|null;
 sport_type:string|null;distance_m:number|null;duration_s:number|null;
 average_heart_rate:number|null;rpe_raw:number|null}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return respond(403,{error:'Origin forbidden'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return respond(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return respond(503,{error:'Coach-Kontext nicht eingerichtet'},h)
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return respond(401,{error:'Anmeldung erforderlich'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await auth.auth.getUser(bearer[1])
  if(authError||!user)return respond(401,{error:'Ungültige Anmeldung'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return respond(403,{error:'Zugriff nicht erlaubt'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:current,error:readError}=await db.from('garmin_coach_context')
   .select('user_id,illness_state,illness_started_on,return_started_on,blocked_periods,run_reviews,updated_at')
   .eq('user_id',user.id).maybeSingle()
  if(readError)return respond(503,{error:'Coach-Kontext nicht abrufbar'},h)
  let row=(current||empty(user.id)) as Row
  const today=berlinToday()
  const readRuns=async()=>{
   if(row.illness_state!=='returning'||!row.return_started_on)return [] as Run[]
   const {data,error}=await db.from('garmin_activities').select(activityFields)
    .gte('start_time_local',row.return_started_on).order('start_time_local',{ascending:true}).limit(150)
   if(error)throw Error('Return-run read unavailable')
   return ((data||[]) as Run[]).filter(x=>isRun(x.sport_type)).slice(0,3)
  }
  if(req.method==='GET'){
   const runs=await readRuns()
   return respond(200,{context:row,runs,ownerOnly:true,garminWritesActive:false},h)
  }
  const raw=await req.text()
  if(raw.length>3000)return respond(413,{error:'Anfrage zu groß'},h)
  let input:Record<string,unknown>
  try{input=JSON.parse(raw)}catch{return respond(422,{error:'Ungültiges JSON'},h)}
  if(!input||typeof input!=='object'||Array.isArray(input))
   return respond(422,{error:'Ungültige Anfrage'},h)
  if(input.action==='start_illness'){
   row={...row,illness_state:'sick',illness_started_on:today,
    return_started_on:null,run_reviews:[]}
  }else if(input.action==='start_return'){
   if(row.illness_state!=='sick'||input.confirmRecovered!==true)
    return respond(409,{error:'Bitte Genesung ausdrücklich bestätigen'},h)
   row={...row,illness_state:'returning',return_started_on:today,run_reviews:[]}
  }else if(input.action==='review_run'){
   if(row.illness_state!=='returning'||typeof input.activityId!=='string'||
    !['ok','concern'].includes(String(input.assessment)))
    return respond(409,{error:'Wiedereinstieg nicht aktiv'},h)
   const runs=await readRuns()
   const run=runs.find(x=>x.activity_id===input.activityId)
   if(!run||!run.start_time_local||run.start_time_local.slice(0,10)>=today)
    return respond(422,{error:'Lauf frühestens am Folgetag beurteilen'},h)
   const review:Review={activityId:run.activity_id,
    assessment:input.assessment as Review['assessment'],reviewedOn:today}
   row={...row,run_reviews:[...row.run_reviews.filter(x=>x.activityId!==review.activityId),review].slice(0,3)}
  }else if(input.action==='finish_return'){
   if(row.illness_state!=='returning'||input.confirmWell!==true)
    return respond(409,{error:'Bestätigung fehlt'},h)
   const runs=await readRuns()
   const firstTwo=runs.slice(0,2)
   if(firstTwo.length!==2||firstTwo.some(r=>!row.run_reviews.some(
    x=>x.activityId===r.activity_id&&x.assessment==='ok')))
    return respond(409,{error:'Zwei erste Läufe ohne Beschwerden am Folgetag bestätigen'},h)
   if(row.run_reviews.some(x=>x.assessment==='concern'))
    return respond(409,{error:'Beschwerden im Wiedereinstieg: erst fachlich klären'},h)
   row={...row,illness_state:'well'}
  }else if(input.action==='add_block'){
   if(!day(input.start)||!day(input.end)||!['vacation','unavailable'].includes(String(input.reason))||
    input.start<today||input.end<input.start||input.end>plusDays(today,365)||
    dayDiff(input.start,input.end)>60)
    return respond(422,{error:'Zeitraum ungültig (heute bis 12 Monate, maximal 61 Tage)'},h)
   if(row.blocked_periods.length>=12)
    return respond(422,{error:'Bitte erst einen alten Block entfernen (max. 12)'},h)
   const period:Period={id:crypto.randomUUID(),start:input.start,end:input.end,
    reason:input.reason as Period['reason']}
   row={...row,blocked_periods:[...row.blocked_periods,period]}
  }else if(input.action==='remove_block'){
   if(typeof input.id!=='string'||!row.blocked_periods.some(x=>x.id===input.id))
    return respond(422,{error:'Block nicht gefunden'},h)
   row={...row,blocked_periods:row.blocked_periods.filter(x=>x.id!==input.id)}
  }else return respond(422,{error:'Unbekannte Aktion'},h)
  const {data:saved,error:saveError}=await db.from('garmin_coach_context')
   .upsert({...row,user_id:user.id,updated_at:new Date().toISOString()},{onConflict:'user_id'})
   .select('user_id,illness_state,illness_started_on,return_started_on,blocked_periods,run_reviews,updated_at').single()
  if(saveError||!saved)return respond(503,{error:'Coach-Kontext konnte nicht gespeichert werden'},h)
  row=saved as Row
  return respond(200,{saved:true,context:row,runs:await readRuns(),
   garminChanged:false,intervalsChanged:false},h)
 }catch{
  return respond(503,{error:'Coach-Kontext derzeit nicht verfügbar'},h)
 }
})

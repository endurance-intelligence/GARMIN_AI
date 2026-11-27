/** One private Coach data reader, two independent authorization paths.
 * GET: verified owner session, read only. POST: cron secret, archive only. */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {publicRecoveryRow} from '../../../src/lib/recoverySleep.mjs'
import {readArchiveCoachInput} from '../_shared/coach-archive-reader.ts'
import {coachMonday,coachAddDays} from '../../../src/lib/coachSevenDay.mjs'
import {runCoachArchive} from '../../../src/lib/coachArchiveJob.mjs'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function serviceKey(){
 try{const value=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');if(typeof value.default==='string'&&value.default)return value.default}catch{}
 return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
}
function publicKey(){
 try{const value=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');if(typeof value.default==='string'&&value.default)return value.default}catch{}
 return Deno.env.get('SUPABASE_ANON_KEY')||''
}
function todayBerlin(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=(k:string)=>p.find(x=>x.type===k)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
async function findOwner(db:ReturnType<typeof createClient>){
 // Use the same confirmed owner allowlist as every interactive Garmin endpoint.
 // No caller-provided identity and no user tokens minted by a cron job.
 let found:string|null=null
 for(let page=1;page<=20;page++){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:100})
  if(error)throw Error('Owner lookup unavailable')
  for(const u of data.users){
   if(u.email_confirmed_at&&u.email?.trim().toLowerCase()===owner){
    if(found&&found!==u.id)throw Error('Ambiguous owner')
    found=u.id
   }
  }
  if(data.users.length<100){if(!found)throw Error('Owner unavailable');return found}
 }
 throw Error('Owner lookup limit')
}
function snapshotHeaders(origin:string|null){
 const permitted=origin==='https://endurance-intelligence.github.io'||!!origin&&/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
 return {'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
 'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',...(permitted?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
async function snapshotRequest(req:Request){
 const origin=req.headers.get('origin'),h=snapshotHeaders(origin)
 const send=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:h})
 if(origin&&!h['Access-Control-Allow-Origin'])return send(403,{error:'Origin not allowed'})
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!serviceKey()||!publicKey())return send(503,{error:'Coach data unavailable'})
 const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!bearer)return send(401,{error:'Sign in required'})
 try{
  const auth=createClient(project,publicKey(),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(bearer[1])
  if(error||!user)return send(401,{error:'Invalid session'})
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)return send(403,{error:'Not authorized'})
  const today=todayBerlin(),url=new URL(req.url),visible=url.searchParams.get('week')||coachMonday(today)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(visible)||!Number.isFinite(Date.parse(visible+'T12:00:00Z'))||new Date(visible+'T12:00:00Z').toISOString().slice(0,10)!==visible||coachMonday(visible)!==visible||visible<coachAddDays(today,-180)||visible>coachAddDays(today,180))return send(422,{error:'Invalid week'})
  const db=createClient(project,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}})
  const data=await readArchiveCoachInput(db,user.id,today,visible)
  const {data:history,error:historyError}=await db.from('garmin_daily_metrics')
   .select('metric_date,hrv_ms,resting_heart_rate,sleep_seconds,stress_avg,body_battery_max,raw_metrics')
   .gte('metric_date',coachAddDays(today,-89)).lte('metric_date',today).order('metric_date',{ascending:true}).limit(91)
  return send(200,{...data,health:{...data.health,longRecoveryMetrics:!historyError&&Array.isArray(history)&&history.length<=90?history.map(publicRecoveryRow):null},today})
 }catch(e){
  if(e instanceof Error&&e.message==='Central training rhythm not initialized')return send(409,{error:'Central training rhythm not initialized'})
  return send(503,{error:'Coach data incomplete'})
 }
}
Deno.serve(async req=>{
 if(req.method==='GET'||req.method==='OPTIONS')return snapshotRequest(req)
 if(req.method!=='POST'||req.headers.has('origin'))return reply(405,{error:'Private worker'})
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!serviceKey())return reply(503,{error:'Worker unavailable'})
 const token=req.headers.get('x-garmin-sync-secret')||''
 if(!/^[a-f0-9]{64}$/.test(token))return reply(401,{error:'Unauthorized'})
 try{
  const db=createClient(project,serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:allowed,error:authError}=await db.rpc('garmin_verify_cron_token',{p_token:token})
  if(authError)return reply(503,{error:'Authorization unavailable'})
  if(allowed!==true)return reply(401,{error:'Unauthorized'})
  const raw=await req.text()
  if(raw.length>200)return reply(413,{error:'Request too large'})
  let body:any
  try{body=JSON.parse(raw)}catch{return reply(422,{error:'Invalid request'})}
  if(!body||Object.keys(body).length!==1||!['preview','archive'].includes(body.mode))return reply(422,{error:'Invalid mode'})
  const userId=await findOwner(db)
  const result=await runCoachArchive({today:todayBerlin(),dryRun:body.mode==='preview',
   load:(today:string)=>readArchiveCoachInput(db,userId,today),
   save:async(snapshot:unknown)=>{
    const {data,error}=await db.rpc('garmin_archive_week_revision',{p_user:userId,p_request:crypto.randomUUID(),p_snapshot:snapshot})
    if(error||!data)throw Error('Archive unavailable')
    return data
   }})
  return reply(200,result)
 }catch(e){
  // No activity data, IDs, credentials or internal error payloads in responses/logs.
  if(e instanceof Error&&e.message==='Central training rhythm not initialized')return reply(409,{error:'Central training rhythm not initialized'})
  return reply(503,{error:'Coach archive not confirmed'})
 }
})

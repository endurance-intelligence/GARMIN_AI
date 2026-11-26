/** Cron-only, owner-scoped archive. Read-only training inputs; archive RPC is the sole write. */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {readArchiveCoachInput} from '../_shared/coach-archive-reader.ts'
import {runCoachArchive} from '../../../src/lib/coachArchiveJob.mjs'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function serviceKey(){
 try{const value=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');if(typeof value.default==='string'&&value.default)return value.default}catch{}
 return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
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
Deno.serve(async req=>{
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

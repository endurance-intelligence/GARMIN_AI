/**
 * GARMIN_AI v0.7.4 — mobile-safe sync observability + weight entry.
 * Garmin Personal API remains read-only. Manual weight is saved as PENDING,
 * never presented as sent without an independent Garmin Connect verification.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const endpoint = Deno.env.get('SUPABASE_URL') || ''
const owner = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
function envKey(kind:'publishable'|'secret'):string {
  const modern=kind==='publishable'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
  const legacy=kind==='publishable'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const raw=JSON.parse(Deno.env.get(modern)||'{}') as Record<string,unknown>
    if(typeof raw.default==='string' && raw.default)return raw.default
  } catch { /* fallback to configured legacy key */ }
  return Deno.env.get(legacy)||''
}
function cors(origin:string|null) {
  const allowlist=(Deno.env.get('GARMIN_APP_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)
  const allowed=origin && (
    /^http:\/\/(127\.0\.0\.1|localhost):517[3-9]$/.test(origin) ||
    allowlist.includes(origin)
  )
  return {
    ...(allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }
}
const reply=(data:unknown,status:number,headers:Record<string,string>)=>
  new Response(JSON.stringify(data),{status,headers})
const validDate=(v:unknown):v is string=>{
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false
  const date=new Date(v+'T00:00:00.000Z')
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===v
}

Deno.serve(async req=>{
  const origin=req.headers.get('origin')
  const headers=cors(origin)
  if(origin && !headers['Access-Control-Allow-Origin'])return reply({error:'Origin not allowed'},403,headers)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(req.method!=='GET'&&req.method!=='POST')return reply({error:'Method not allowed'},405,headers)
  if(!endpoint||!owner||!envKey('publishable')||!envKey('secret'))
    return reply({error:'Private sync not configured'},503,headers)
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!match)return reply({error:'Login required'},401,headers)
  try {
    const auth=createClient(endpoint,envKey('publishable'),{
      auth:{autoRefreshToken:false,persistSession:false}
    })
    const {data:{user},error:authError}=await auth.auth.getUser(match[1])
    if(authError||!user)return reply({error:'Invalid session'},401,headers)
    if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
      return reply({error:'Not authorized'},403,headers)
    const db=createClient(endpoint,envKey('secret'),{
      auth:{autoRefreshToken:false,persistSession:false}
    })
    if(req.method==='GET'){
      const [activityRuns,health,gear,weight,activities]=await Promise.all([
        db.from('garmin_sync_runs')
          .select('result,activity_count,finished_at')
          .order('finished_at',{ascending:false}).limit(1),
        db.from('garmin_daily_metrics')
          .select('metric_date,synced_at')
          .order('metric_date',{ascending:false}).limit(1),
        db.from('garmin_connect_snapshot')
          .select('checked_at,synced_at,gear_links_checked_at,activity_gear_scope')
          .eq('snapshot_key','primary').maybeSingle(),
        db.from('garmin_weight_outbox')
          .select('weigh_date,weight_kg,state,updated_at,confirmed_at')
          .order('weigh_date',{ascending:false}).limit(7),
        db.from('garmin_activities')
          .select('activity_id,synced_at')
          .order('synced_at',{ascending:false}).limit(1)
      ])
      if(activityRuns.error||health.error||gear.error||weight.error||activities.error)
        return reply({error:'Sync sources temporarily unavailable'},503,headers)
      const run=activityRuns.data?.[0]
      const lastHealth=health.data?.[0]
      const latestActivity=activities.data?.[0]
      return reply({
        sources:{
          activities:{checkedAt:run?.finished_at??null,result:run?.result??'unknown',
            lastImportedAt:latestActivity?.synced_at??null},
          health:{latestDate:lastHealth?.metric_date??null,checkedAt:lastHealth?.synced_at??null},
          equipment:{checkedAt:gear.data?.gear_links_checked_at??null,
            scope:gear.data?.activity_gear_scope??'unknown'},
          calendar:{checkedAt:gear.data?.checked_at??null},
          fit:{status:'existing-queue'}
        },
        weightEntries:weight.data??[],
        weightTransferAvailable:false
      },200,headers)
    }
    if(Number(req.headers.get('content-length')||0)>512)
      return reply({error:'Payload too large'},413,headers)
    const body=await req.text()
    if(body.length>512)return reply({error:'Payload too large'},413,headers)
    let data:unknown
    try {data=JSON.parse(body) as unknown}
    catch {return reply({error:'Invalid JSON'},422,headers)}
    if(!data || typeof data!=='object'||Array.isArray(data))
      return reply({error:'Invalid entry'},422,headers)
    const entry=data as Record<string,unknown>
    if(!validDate(entry.date)||typeof entry.kg!=='number'||!Number.isFinite(entry.kg)||
       entry.kg<30||entry.kg>300||Math.abs(entry.kg*100-Math.round(entry.kg*100))>0.00001)
      return reply({error:'Invalid date or weight'},422,headers)
    const now=Date.now(),requested=Date.parse(entry.date+'T00:00:00Z')
    if(requested<now-31*86400000||requested>now+86400000)
      return reply({error:'Date outside allowed range'},422,headers)
    const {data:existing,error:readError}=await db.from('garmin_weight_outbox')
      .select('weight_kg,state').eq('weigh_date',entry.date).maybeSingle()
    if(readError)throw Error('weight-read')
    if(existing&&existing.state!=='pending')
      return reply({error:'Entry already undergoing transfer or confirmed'},409,headers)
    const value={weigh_date:entry.date,weight_kg:entry.kg,state:'pending',
      updated_at:new Date().toISOString()}
    const {error:writeError}=await db.from('garmin_weight_outbox')
      .upsert(value,{onConflict:'weigh_date'})
    if(writeError)throw Error('weight-write')
    return reply({saved:true,date:entry.date,kg:entry.kg,
      transferStatus:'pending',garminUpdated:false},200,headers)
  } catch {
    return reply({error:'Private sync service unavailable'},502,headers)
  }
})

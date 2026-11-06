/**
 * GARMIN_AI v0.7.4 — mobile-safe sync observability + weight entry.
 * Garmin Personal API remains read-only. Manual weight is saved as PENDING,
 * never presented as sent without an independent Garmin Connect verification.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { validWeightEntry } from '../_shared/weight-entry.mjs'
import {classifySync,classifyFit} from '../_shared/sync-health.mjs'

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
      // Source outcome comes from actual Edge Function logs, never inferred
      // solely from the presence of yesterday's Garmin records.
      const [activityRuns,healthRuns,health,gear,weight,fitCounts,cron,cloudSession] =
        await Promise.all([
          db.from('garmin_sync_runs')
            .select('source,result,finished_at')
            .order('finished_at',{ascending:false}).limit(300),
          db.from('garmin_sync_runs')
            .select('result,message,finished_at')
            .eq('source','garmin-health')
            .order('finished_at',{ascending:false}).limit(10),
          db.from('garmin_daily_metrics')
            .select('metric_date,synced_at')
            .order('metric_date',{ascending:false}).limit(1),
          db.from('garmin_connect_snapshot')
            .select('checked_at,synced_at,gear_links_checked_at,activity_gear_scope')
            .eq('snapshot_key','primary').maybeSingle(),
          db.from('garmin_weight_outbox')
            .select('weigh_date,weight_kg,state,updated_at,confirmed_at')
            .order('weigh_date',{ascending:false}).limit(7),
          Promise.all(['queued','retry','processing','paused','unavailable','complete']
            .map(async status=>{
              const result=await db.from('garmin_activity_details')
                .select('activity_id',{count:'exact',head:true}).eq('fit_status',status)
              return {status,count:result.count,error:result.error}
            })),
          db.rpc('garmin_sync_scheduler_status'),
          db.rpc('garmin_connect_session_state')
        ])
      if(activityRuns.error||healthRuns.error||health.error||gear.error||weight.error ||
         fitCounts.some(r=>r.error))
        return reply({error:'Sync sources temporarily unavailable'},503,headers)
      // Use the existing activity job's source default. Do not force
      // a new source string that might violate a historical CHECK constraint.
      const activityHistory=(activityRuns.data||[]).filter(r=>{
        const source=r.source==null?'':String(r.source).trim().toLowerCase()
        return source!== 'garmin-health'
      })
      const first=activityHistory[0]
      const healthFirst=healthRuns.data?.[0]
      const latestHealth=health.data?.[0]
      const lastSuccess=(runs:{result:string;finished_at:string}[]|null|undefined)=>
        runs?.find(r=>r.result==='success')?.finished_at??null
      const toCount=(status:string)=>fitCounts.find(r=>r.status===status)?.count??0
      const fit={
        queued:toCount('queued'),retry:toCount('retry'),
        processing:toCount('processing'),paused:toCount('paused'),
        unavailable:toCount('unavailable'),complete:toCount('complete')
      }
      const fitSummary=classifyFit(fit)
      const activities=classifySync({
        lastAttemptAt:first?.finished_at??null,
        lastSuccessAt:lastSuccess(activityHistory),
        lastResult:first?.result??null,thresholdHours:3
      })
      const healthState=classifySync({
        lastAttemptAt:healthFirst?.finished_at??null,
        lastSuccessAt:lastSuccess(healthRuns.data),
        lastResult:healthFirst?.result??null,thresholdHours:30
      })
      const gearState=classifySync({manual:true})
      const calendarState=classifySync({manual:true})
      // A successful pg_cron dispatch only proves scheduling, never that an
      // HTTP request reached Garmin or that the data landed in the database.
      const scheduler=cron.error||!cron.data ?
        {available:false,jobs:[]} : cron.data
      const sourceHealth=healthFirst?.message||''
      const sourcesMatch=/sources=(\d+)\/(\d+)/.exec(sourceHealth)
      const partialHealth=!!sourcesMatch && Number(sourcesMatch[1])<Number(sourcesMatch[2])
      return reply({
        sources:{
          activities:{...activities,checkedAt:first?.finished_at??null,
            lastSuccessAt:lastSuccess(activityHistory),result:first?.result??'unknown'},
          health:{...healthState,
            state:healthState.state==='ok'&&partialHealth?'partial':healthState.state,
            checkedAt:healthFirst?.finished_at??null,
            lastSuccessAt:lastSuccess(healthRuns.data),
            latestDate:latestHealth?.metric_date??null},
          equipment:{...gearState,checkedAt:gear.data?.gear_links_checked_at??null,
            scope:gear.data?.activity_gear_scope??'unknown'},
          calendar:{...calendarState,checkedAt:gear.data?.checked_at??null},
          fit:{...fitSummary,counts:fit}
        },
        scheduler,
        cloudConnect:cloudSession.error||!cloudSession.data?
          {connected:false,status:'unknown'}:
          {connected:cloudSession.data.connected===true,status:'configured'},
        weightEntries:weight.data??[],weightTransferAvailable:false
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
    const entry=validWeightEntry(data)
    if(!entry)return reply({error:'Invalid date or weight'},422,headers)
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

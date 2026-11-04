/** GARMIN_AI v0.6.3 – read-only, authenticated screening of historical running recordings.
 * Independent of sync jobs. Never exposes secrets, raw samples, GPS or heart-rate profile data.
 * The result is NOT an LT1/VT1 estimate or medical/training clearance.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { screenRun } from './evidence.ts'

const projectUrl = Deno.env.get('SUPABASE_URL') || ''
const ownerEmail = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL') || '').trim().toLowerCase()
const RUNNING = ['running','track_running','treadmill_running','ultra_run']
const PAGE_LIMIT = 800
const DETAIL_LIMIT = 28

type Activity = { activity_id:string;activity_name:string|null;start_time_local:string|null;
  sport_type:string|null;distance_m:number|null;duration_s:number|null;average_heart_rate:number|null }
type DetailStatus = {activity_id:string; status:string; hr_sample_count:number|null; sample_count:number|null}

function key(kind: 'publishable'|'secret'):string {
  const modern=kind==='publishable'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS'
  const legacy=kind==='publishable'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY'
  try {const parsed:unknown=JSON.parse(Deno.env.get(modern)||'{}')
    if(parsed && typeof parsed==='object' && 'default' in parsed){
      const k=(parsed as {default?:unknown}).default;if(typeof k==='string'&&k)return k
    }
  } catch { /* fallback */ }
  return Deno.env.get(legacy)||''
}
function cors(origin:string|null):Record<string,string> {
  const allowed=!!origin && /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
  return {
    ...(allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }
}
function json(data:unknown,status:number,headers:Record<string,string>){
  return new Response(JSON.stringify(data),{status,headers})
}
function batches<T>(items:T[],size:number):T[][] {
  const result:T[][]=[];for(let i=0;i<items.length;i+=size)result.push(items.slice(i,i+size))
  return result
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin'),headers=cors(origin)
  if(origin&&!headers['Access-Control-Allow-Origin'])return json({error:'Origin not allowed'},403,headers)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(req.method!=='GET')return json({error:'Method not allowed'},405,headers)
  if(!projectUrl||!ownerEmail||!key('publishable')||!key('secret'))return json({error:'Private analytics not configured'},503,headers)
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!match)return json({error:'Login required'},401,headers)
  try {
    const auth=createClient(projectUrl,key('publishable'),{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error:authError}=await auth.auth.getUser(match[1])
    if(authError||!user)return json({error:'Invalid session'},401,headers)
    if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==ownerEmail)
      return json({error:'Not authorized for training data'},403,headers)

    const admin=createClient(projectUrl,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
    // 800 is a declared finite scan window, NOT an assertion that every Garmin activity was examined.
    const {data:rows,error:listError}=await admin.from('garmin_activities')
      .select('activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s,average_heart_rate')
      .in('sport_type',RUNNING).order('start_time_local',{ascending:false}).limit(PAGE_LIMIT)
    if(listError)throw new Error(`running list ${listError.code}`)
    const running=(rows??[]) as Activity[]
    const initial=running.filter(a=>
      (a.sport_type==='running'||a.sport_type==='treadmill_running')&&
      typeof a.duration_s==='number'&&a.duration_s>=1800&&a.duration_s<=12000&&
      typeof a.distance_m==='number'&&a.distance_m>=3000&&
      typeof a.average_heart_rate==='number'&&a.average_heart_rate>=60&&a.average_heart_rate<=195)
    // Status-only query first: no large JSON sample blobs for non-candidates.
    const statuses:DetailStatus[]=[]
    for(const batch of batches(initial.map(a=>String(a.activity_id)),70)) {
      const {data,error}=await admin.from('garmin_activity_details')
        .select('activity_id,status,hr_sample_count,sample_count').in('activity_id',batch)
      if(error)throw new Error(`detail status ${error.code}`)
      statuses.push(...(data??[]) as DetailStatus[])
    }
    const statusMap=new Map(statuses.map(d=>[String(d.activity_id),d]))
    const withSeries=initial.filter(a=>{
      const d=statusMap.get(String(a.activity_id))
      return !!d && (d.status==='complete'||d.status==='partial') && (d.hr_sample_count??0)>=150
    })
    const chosen=withSeries.slice(0,DETAIL_LIMIT)
    const sampleMap=new Map<string,{samples:unknown;status:string}>()
    for(const batch of batches(chosen.map(a=>String(a.activity_id)),7)) {
      const {data,error}=await admin.from('garmin_activity_details')
        .select('activity_id,status,samples').in('activity_id',batch)
      if(error)throw new Error(`detail samples ${error.code}`)
      for(const d of data??[])sampleMap.set(String(d.activity_id),{samples:d.samples,status:d.status})
    }
    const scored=chosen.map(a=>{
      const detail=sampleMap.get(String(a.activity_id))
      const metrics=screenRun(detail?.samples??[],a.duration_s!)
      return {
        id:String(a.activity_id),name:typeof a.activity_name==='string'?a.activity_name.slice(0,100):'Lauf',
        date:a.start_time_local, sport:a.sport_type, distanceKm:Math.round(a.distance_m!/10)/100,
        durationMinutes:Math.round(a.duration_s!/60),
        ...metrics,
      }
    })
    const comparable=scored.filter(x=>x.classification==='comparable')
    const limited=scored.filter(x=>x.classification==='limited')
    const excluded=scored.filter(x=>x.classification==='excluded')
    return json({
      source:'Garmin / Supabase – gespeicherte Trainingsdetails',
      analyzedAt:new Date().toISOString(),
      scan:{runningRead:running.length, capped:running.length===PAGE_LIMIT,
        metadataCandidates:initial.length, withHrDetails:withSeries.length,
        detailEvaluated:scored.length, detailLimit:DETAIL_LIMIT,
        comparable:comparable.length,limited:limited.length,excluded:excluded.length},
      comparable:comparable.slice(0,8),limited:limited.slice(0,5),excluded:excluded.slice(0,5),
      conclusion:'Kein LT1/VT1-Bereich berechnet. Messreihen zeigen nur beobachtete HF- und Tempoänderungen.',
    },200,headers)
  }catch(error){
    console.error('GARMIN_AI aerobic read:',error instanceof Error?error.message:'unexpected')
    return json({error:'Aerobic screening temporarily unavailable'},502,headers)
  }
})

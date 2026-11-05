/**
 * GARMIN_AI v0.7.3.2: authenticated, owner-only context snapshot.
 * Garmin Connect credentials/tokens NEVER reach Supabase. The local report
 * contains only whitelisted, read-only context data. POST requires user click.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL') || ''
const owner = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL') || '').trim().toLowerCase()
function envKey(kind: 'publishable'|'secret') {
  const modern = kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS'
  const legacy = kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const raw: unknown = JSON.parse(Deno.env.get(modern) || '{}')
    if (raw && typeof raw === 'object' && 'default' in raw) {
      const value = (raw as Record<string, unknown>).default
      if (typeof value === 'string' && value) return value
    }
  } catch { /* legacy fallback */ }
  return Deno.env.get(legacy) || ''
}
function headers(origin: string|null) {
  const allowed = !!origin && /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
  return { ...(allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'private, no-store',
    'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff' }
}
const reply = (body:unknown,status:number,h:Record<string,string>) =>
  new Response(JSON.stringify(body),{status,headers:h})
const plain = (x:unknown): x is Record<string,unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x)
const string = (x:unknown,max=180) => typeof x === 'string' && x.trim() && x.length <= max ? x.trim() : null
const id = (x:unknown,max=80) => {
  const t= typeof x==='number' && Number.isSafeInteger(x) ? String(x) : x
  return typeof t==='string' && t.length <= max && /^[A-Za-z0-9_-]+$/.test(t) ? t : null
}
function parseSnapshot(payload:unknown) {
  if (!plain(payload) || payload.readOnly !== true || payload.source !== 'Garmin Connect (unofficial)') throw Error('source')
  const checkedAt = string(payload.checkedAt,40)
  if (!checkedAt || !Number.isFinite(Date.parse(checkedAt)) ||
      Math.abs(Date.now()-Date.parse(checkedAt))>14*86400000) throw Error('timestamp')
  if (!Array.isArray(payload.gear) || payload.gear.length>250 ||
      !Array.isArray(payload.schedule) || payload.schedule.length>500 ||
      !Array.isArray(payload.activityGear) || payload.activityGear.length>250) throw Error('limits')
  const gear = payload.gear.map(x=>{
    if(!plain(x)) throw Error('gear')
    const gearId=id(x.id)
    if(!gearId) throw Error('gear-id')
    return { id:gearId,name:string(x.name)||string(x.model)||'Equipment',
      brand:string(x.brand),model:string(x.model),type:string(x.type) }
  })
  const schedule = payload.schedule.map(x=>{
    if(!plain(x)) throw Error('schedule')
    const date=string(x.date,10)
    if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw Error('date')
    const scheduleId=id(x.id), workoutId=id(x.workoutId)
    if(!scheduleId && !workoutId && !string(x.name)) throw Error('workout')
    return {date,id:scheduleId,workoutId,name:string(x.name),sport:string(x.sport),restDay:x.restDay===true}
  })
  const activityGear = payload.activityGear.map(x=>{
    if(!plain(x)) throw Error('link')
    const activityId=id(x.activityId,20), gearId=id(x.gearId)
    if(!activityId || !/^\d{5,20}$/.test(activityId) || !gearId) throw Error('link-id')
    return {activityId,gearId}
  })
  if(new Set(gear.map(x=>x.id)).size!==gear.length) throw Error('duplicate-gear')
  if(activityGear.some(x=>!gear.some(g=>g.id===x.gearId))) throw Error('orphan-link')
  return {gear,schedule,activity_gear:activityGear,checked_at:checkedAt,activity_gear_scope:'single-activity'}
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin')
  const h=headers(origin)
  if(origin && !h['Access-Control-Allow-Origin']) return reply({error:'Origin not allowed'},403,h)
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:h})
  if(req.method!=='GET' && req.method!=='POST') return reply({error:'Method not allowed'},405,h)
  if(!url || !owner || !envKey('publishable') || !envKey('secret')) return reply({error:'Not configured'},503,h)
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!match) return reply({error:'Login required'},401,h)
  try {
    const auth=createClient(url,envKey('publishable'),{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:{user},error}=await auth.auth.getUser(match[1])
    if(error || !user) return reply({error:'Invalid login'},401,h)
    if(!user.email_confirmed_at || user.email?.trim().toLowerCase()!==owner)
      return reply({error:'Not authorized'},403,h)
    const db=createClient(url,envKey('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
    if(req.method==='GET') {
      const {data,error:readError}=await db.from('garmin_connect_snapshot').select(
        'gear,schedule,activity_gear,activity_gear_scope,checked_at,synced_at'
      ).eq('snapshot_key','primary').maybeSingle()
      if(readError) throw Error('db-read')
      return reply({snapshot:data},200,h)
    }
    if(Number(req.headers.get('content-length')||0)>150000) return reply({error:'Payload too large'},413,h)
    const raw=await req.text()
    if(raw.length>150000) return reply({error:'Payload too large'},413,h)
    let parsed: ReturnType<typeof parseSnapshot>
    try {parsed=parseSnapshot(JSON.parse(raw)) }
    catch {return reply({error:'Invalid normalized snapshot'},422,h)}
    const {error:writeError}=await db.from('garmin_connect_snapshot').upsert(
      {snapshot_key:'primary',...parsed,synced_at:new Date().toISOString()},
      {onConflict:'snapshot_key'}
    )
    if(writeError) throw Error('db-write')
    return reply({saved:true,gear:parsed.gear.length,schedule:parsed.schedule.length,
      activityLinks:parsed.activity_gear.length,activityGearScope:parsed.activity_gear_scope},200,h)
  } catch {
    return reply({error:'Snapshot unavailable'},502,h)
  }
})

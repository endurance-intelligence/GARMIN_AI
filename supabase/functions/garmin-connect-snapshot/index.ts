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
      !Array.isArray(payload.activityGear) || payload.activityGear.length>3000) throw Error('limits')
  const gear = payload.gear.map(x=>{
    if(!plain(x)) throw Error('gear')
    const gearId=id(x.id)
    if(!gearId) throw Error('gear-id')
    return { id:gearId,name:string(x.name)||string(x.model)||'Equipment',
      brand:string(x.brand),model:string(x.model),type:string(x.type),
      status:x.status==='active'||x.status==='retired' ? x.status : 'unknown' }
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
  return {gear,schedule,activity_gear:activityGear,checked_at:checkedAt,activity_gear_scope: payload.completeHistory===true ? 'complete' : 'single-activity'}
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
        'gear,schedule,activity_gear,activity_gear_scope,checked_at,synced_at,gear_links_checked_at'
      ).eq('snapshot_key','primary').maybeSingle()
      if(readError) throw Error('db-read')
      if (!data || data.activity_gear_scope!=='complete') return reply({snapshot:data,usage:[]},200,h)
      // Distance is calculated ONLY from existing canonical Garmin activity rows;
      // never trust totals contained in the client-supplied report.
      const links=Array.isArray(data.activity_gear)?data.activity_gear:[]
      const ids=[...new Set(links.map((l:Record<string,unknown>)=>String(l.activityId||'')).filter(Boolean))]
      const activities=new Map<string,{distance_m:number|null;sport_type:string|null}>()
      for (let i=0;i<ids.length;i+=100) {
        const {data:found,error:queryError}=await db.from('garmin_activities')
          .select('activity_id,distance_m,sport_type').in('activity_id',ids.slice(i,i+100))
        if(queryError) throw Error('activity-lookup')
        for (const row of found||[]) activities.set(String(row.activity_id),{
          distance_m:typeof row.distance_m==='number' && Number.isFinite(row.distance_m) &&
            row.distance_m>=0?row.distance_m:null,sport_type:row.sport_type
        })
      }
      const usage=(Array.isArray(data.gear)?data.gear:[]).map((g:Record<string,unknown>)=>{
        const group=links.filter((l:Record<string,unknown>)=>l.gearId===g.id)
        let meters=0,missing=0
        for(const item of group) {
          const activity=activities.get(String(item.activityId))
          if(!activity || activity.distance_m===null) missing++
          else meters+=activity.distance_m
        }
        return {gearId:g.id,linkedActivities:group.length,missingActivities:missing,
          knownDistanceKm:Math.round(meters/10)/100}
      })
      return reply({snapshot:data,usage},200,h)
    }
    if(Number(req.headers.get('content-length')||0)>150000) return reply({error:'Payload too large'},413,h)
    const raw=await req.text()
    if(raw.length>150000) return reply({error:'Payload too large'},413,h)
    let input: unknown
    try { input=JSON.parse(raw) as unknown }
    catch { return reply({error:'Invalid JSON'},422,h) }
    // Status-only refresh preserves the entire 411-link activity history and
    // the calendar, even when local verification changed its timestamp.
    if (plain(input) && input.mode==='gear-status') {
      const checked=string(input.checkedAt,40)
      if(input.source!=='Garmin Connect (unofficial)' || input.readOnly!==true ||
         !checked || !Number.isFinite(Date.parse(checked)) ||
         Math.abs(Date.now()-Date.parse(checked))>7*86400000 ||
         !Array.isArray(input.gear) || input.gear.length<1 || input.gear.length>250)
        return reply({error:'Invalid gear status report'},422,h)
      const sanitized=input.gear.map(item=>{
        if(!plain(item)) return null
        const gearId=id(item.id)
        if(!gearId) return null
        return {id:gearId,status:item.status==='active'||item.status==='retired'?item.status:'unknown',
          type:string(item.type)}
      })
      if(sanitized.some(x=>!x) || !sanitized.some(x=>x?.status!=='unknown'))
        return reply({error:'No verified gear status'},422,h)
      const {data:previous,error:previousError}=await db.from('garmin_connect_snapshot')
        .select('gear,synced_at').eq('snapshot_key','primary').maybeSingle()
      if(previousError) throw Error('status-read')
      if(!previous || !Array.isArray(previous.gear) || previous.gear.length!==sanitized.length)
        return reply({error:'Gear catalog changed; refresh full snapshot'},409,h)
      const normalize=(value:string)=>value.replace(/-/g,'').toLowerCase()
      const incoming=new Map<string,{id:string;status:string;type:string|null}>()
      for (const item of sanitized) {
        if (item) incoming.set(normalize(item.id),item)
      }
      if(incoming.size!==sanitized.length || previous.gear.some((g:Record<string,unknown>)=>
          typeof g.id!=='string'||!incoming.has(normalize(g.id))))
        return reply({error:'Gear IDs changed; refresh full snapshot'},409,h)
      const next=previous.gear.map((g:Record<string,unknown>)=>{
        const update=incoming.get(normalize(String(g.id)))!
        return {...g,status:update.status,type:update.type}
      })
      // Optimistic check prevents overwriting a concurrent full snapshot upload.
      const {data:saved,error:saveError}=await db.from('garmin_connect_snapshot')
        .update({gear:next,synced_at:new Date().toISOString()})
        .eq('snapshot_key','primary').eq('synced_at',previous.synced_at)
        .select('snapshot_key').maybeSingle()
      if(saveError) throw Error('status-write')
      if(!saved) return reply({error:'Snapshot changed; retry status update'},409,h)
      return reply({saved:true,mode:'gear-status',gear:next.length,
        active:sanitized.filter(x=>x?.status==='active').length,
        retired:sanitized.filter(x=>x?.status==='retired').length,
        unknown:sanitized.filter(x=>x?.status==='unknown').length},200,h)
    }
    if (plain(input) && input.mode==='gear-links') {
      const check=string(input.checkedAt,40)
      if(input.source!=='Garmin Connect (unofficial)' || input.readOnly!==true ||
         !check || !Number.isFinite(Date.parse(check)) ||
         Math.abs(Date.now()-Date.parse(check))>7*86400000 ||
         !Array.isArray(input.gearIds) || !Array.isArray(input.activityGear) ||
         input.gearIds.length<1 || input.gearIds.length>100 ||
         input.activityGear.length>3000 ||
         input.gearChecked!==input.gearIds.length)
        return reply({error:'Invalid complete gear scan'},422,h)
      const canonical=(value:unknown) => {
        const key=typeof value==='string'?value.replace(/-/g,'').toLowerCase():''
        return /^[a-f0-9]{32}$/.test(key)?key:null
      }
      const scannedIds=input.gearIds.map(canonical)
      if(scannedIds.some(x=>!x)||new Set(scannedIds).size!==scannedIds.length)
        return reply({error:'Invalid gear scan identities'},422,h)

      const {data:previous,error:previousError}=await db.from('garmin_connect_snapshot')
        .select('gear,activity_gear,activity_gear_scope,gear_links_checked_at,synced_at')
        .eq('snapshot_key','primary').maybeSingle()
      if(previousError) throw Error('links-read')
      if(!previous || previous.activity_gear_scope!=='complete' || !Array.isArray(previous.gear))
        return reply({error:'Complete baseline required'},409,h)
      const currentIds=new Map<string,string>()
      for(const entry of previous.gear) {
        const existing=plain(entry)?canonical(entry.id):null
        if(!existing || currentIds.has(existing)) return reply({error:'Invalid current gear'},409,h)
        currentIds.set(existing,String(entry.id))
      }
      if(currentIds.size!==scannedIds.length ||
         scannedIds.some(x=>!x || !currentIds.has(x)))
        return reply({error:'Gear catalog changed. Re-verify Garmin gear first.'},409,h)
      const last=previous.gear_links_checked_at?Date.parse(previous.gear_links_checked_at):0
      if(Number.isFinite(last) && Date.parse(check)<=last)
        return reply({error:'Gear scan is older than stored links'},409,h)

      const newLinks:Array<{activityId:string;gearId:string}>=[]
      const seen=new Set<string>()
      for(const item of input.activityGear) {
        if(!plain(item)) return reply({error:'Invalid gear link'},422,h)
        const activityId=id(item.activityId,20),normalized=canonical(item.gearId)
        if(!activityId || !/^\d{5,20}$/.test(activityId) ||
           !normalized || !currentIds.has(normalized))
          return reply({error:'Unknown activity or gear ID'},422,h)
        const key=activityId+':'+normalized
        if(seen.has(key)) return reply({error:'Duplicate gear link'},422,h)
        seen.add(key)
        newLinks.push({activityId,gearId:currentIds.get(normalized)!})
      }
      const old=Array.isArray(previous.activity_gear)?previous.activity_gear:[]
      const oldKeys=new Set(old.filter(plain).map((l:Record<string,unknown>)=>
        String(l.activityId)+':'+canonical(l.gearId)))
      const added=[...seen].filter(key=>!oldKeys.has(key)).length
      const removed=[...oldKeys].filter(key=>!seen.has(key)).length

      const {data:saved,error:writeError}=await db.from('garmin_connect_snapshot')
        .update({activity_gear:newLinks,activity_gear_scope:'complete',
          gear_links_checked_at:check,synced_at:new Date().toISOString()})
        .eq('snapshot_key','primary').eq('synced_at',previous.synced_at)
        .select('snapshot_key').maybeSingle()
      if(writeError) throw Error('links-write')
      if(!saved) return reply({error:'Snapshot changed. Retry the import.'},409,h)
      return reply({saved:true,mode:'gear-links',previous:old.length,current:newLinks.length,
        added,removed,checkedAt:check},200,h)
    }
    let parsed: ReturnType<typeof parseSnapshot>
    try {parsed=parseSnapshot(input) }
    catch {return reply({error:'Invalid normalized snapshot'},422,h)}
    const {data:previous,error:previousError}=await db.from('garmin_connect_snapshot')
      .select('activity_gear_scope').eq('snapshot_key','primary').maybeSingle()
    if(previousError) throw Error('db-previous')
    if(previous?.activity_gear_scope==='complete' && parsed.activity_gear_scope!=='complete')
      return reply({error:'Refusing to replace complete history with partial data'},409,h)
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

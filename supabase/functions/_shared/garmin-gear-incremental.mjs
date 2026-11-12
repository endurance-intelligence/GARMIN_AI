/** Garmin Connect read-only incremental equipment association logic.
 * Does not infer default shoes, distances or Garmin write operations.
 * Shared by trusted GitHub Node runner and Supabase OIDC worker.
 */
const RUNNING=new Set(['running','track_running','treadmill_running','trail_running',
  'ultra_run','virtual_run','street_running','indoor_running','indoor_track_running'])
const maxDays=21, recentDays=7, maxTargets=30
const DAY=86400000
export function canonicalGearId(raw){
 if(typeof raw!=='string')return null
 const key=raw.replace(/-/g,'').toLowerCase()
 return /^[0-9a-f]{32}$/.test(key)?key:null
}
export function validActivityId(value){
 return typeof value==='string'&&/^\d{5,20}$/.test(value)
}
export function runningSport(sport){
 return typeof sport==='string'&&(RUNNING.has(sport.toLowerCase())||
  /(?:^|_)running$/.test(sport.toLowerCase()))
}
export function knownGearIndex(gear){
 if(!Array.isArray(gear)||gear.length<1||gear.length>250)
  throw Error('Verified Garmin gear catalog required')
 const byId=new Map()
 for(const g of gear){
  const id=canonicalGearId(g?.id)
  if(!id||byId.has(id))throw Error('Invalid or duplicate Garmin catalog gear ID')
  byId.set(id,g.id)
 }
 return byId
}
export function readActivityGear(raw,catalog){
 if(!Array.isArray(raw)||raw.length>20)throw Error('Garmin activity gear response unavailable')
 const known=knownGearIndex(catalog)
 const ids=new Set()
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))
   throw Error('Invalid Garmin activity gear entry')
  // Garmin Connect's getActivityGear returns a list of gear records, not a profile.
  const c=canonicalGearId(item.uuid??item.gearUUID??item.gearUuid??item.gearId??item.id)
  if(!c)throw Error('Garmin activity gear identifier not supported')
  const exact=known.get(c)
  if(!exact)throw Error('New Garmin gear is not in the verified catalog')
  ids.add(exact)
 }
 return [...ids]
}
export function selectActivityTargets(activities,links,nowDate){
 if(!Array.isArray(activities)||!Array.isArray(links)||
  typeof nowDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(nowDate))
  throw Error('Invalid incremental gear inputs')
 const now=Date.parse(nowDate+'T12:00:00Z')
 if(!Number.isFinite(now))throw Error('Invalid sync day')
 const known=new Set(links.map(x=>String(x?.activityId||'')))
 const seen=new Set()
 const eligible=[]
 for(const a of activities){
  const id=String(a?.activity_id||''),date=String(a?.start_time_local||'').slice(0,10)
  if(!validActivityId(id)||seen.has(id)||!runningSport(a?.sport_type)||
     !/^\d{4}-\d{2}-\d{2}$/.test(date))continue
  const age=Math.round((now-Date.parse(date+'T12:00:00Z'))/DAY)
  if(!Number.isFinite(age)||age<0||age>maxDays)continue
  if(known.has(id)&&age>recentDays)continue
  seen.add(id)
  eligible.push({activityId:id,date})
 }
 eligible.sort((a,b)=>b.date.localeCompare(a.date)||b.activityId.localeCompare(a.activityId))
 return eligible.slice(0,maxTargets)
}
export function mergeActivityGear(existing,catalog,reports){
 if(!Array.isArray(existing)||existing.length>3000||
  !Array.isArray(reports)||reports.length<1||reports.length>maxTargets)
  throw Error('Invalid incremental gear reconciliation')
 const known=knownGearIndex(catalog)
 const touched=new Set(),fresh=[]
 for(const report of reports){
  if(!validActivityId(report?.activityId)||touched.has(report.activityId)||
    !Array.isArray(report.gearIds)||report.gearIds.length>20)
   throw Error('Invalid or duplicate activity report')
  touched.add(report.activityId)
  const gearIds=new Set()
  for(const raw of report.gearIds){
   const canonical=canonicalGearId(raw),exact=canonical&&known.get(canonical)
   if(!exact)throw Error('Unknown gear cannot be linked to running activity')
   gearIds.add(exact)
  }
  for(const gearId of gearIds)fresh.push({activityId:report.activityId,gearId})
 }
 const preserved=[]
 const oldKeys=new Set()
 for(const l of existing){
  if(!validActivityId(l?.activityId)||!canonicalGearId(l?.gearId)||
    !known.has(canonicalGearId(l.gearId)))throw Error('Old verified gear baseline invalid')
  const key=l.activityId+':'+canonicalGearId(l.gearId)
  if(oldKeys.has(key))throw Error('Duplicate old activity gear link')
  oldKeys.add(key)
  if(!touched.has(l.activityId))preserved.push(l)
 }
 const links=[...preserved,...fresh]
 if(links.length>3000)throw Error('Gear history exceeds snapshot limit')
 const currentKeys=new Set(links.map(l=>l.activityId+':'+canonicalGearId(l.gearId)))
 return {links,added:[...currentKeys].filter(k=>!oldKeys.has(k)).length,
  removed:[...oldKeys].filter(k=>!currentKeys.has(k)).length,
  verifiedActivities:touched.size}
}

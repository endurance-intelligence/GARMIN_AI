/**
 * GARMIN_AI v0.7.3.6 – resumable, authoritative shoe/activity mapping.
 * Gear moves must REMOVE old pairs as well as ADD new pairs.
 */
import { normalizeGearActivities } from './garmin-gear-history-model.mjs'

export function canonicalGearId(id) {
  if (typeof id !== 'string') return null
  const bare=id.replace(/-/g,'').toLowerCase()
  return /^[a-f0-9]{32}$/.test(bare) ? bare : null
}
function assertGearIds(gear) {
  if (!Array.isArray(gear) || gear.length<1 || gear.length>100)
    throw Error('Invalid Garmin gear catalog')
  const ids=gear.map(x=>canonicalGearId(x?.id))
  if (ids.some(x=>!x) || new Set(ids).size!==ids.length)
    throw Error('Invalid or duplicate gear identifiers')
  return ids
}
export function startGearScan(gear, now=new Date().toISOString()) {
  const gearIds=assertGearIds(gear)
  return {version:1,source:'Garmin Connect (unofficial)',startedAt:now,gearIds,
    completed:{},readOnly:true}
}
export function resumeGearScan(raw,gear,now=Date.now()) {
  const ids=assertGearIds(gear)
  if (!raw || typeof raw!=='object' || raw.version!==1 ||
      raw.readOnly!==true || raw.source!=='Garmin Connect (unofficial)' ||
      !Array.isArray(raw.gearIds) ||
      JSON.stringify(raw.gearIds)!==JSON.stringify(ids) ||
      !Number.isFinite(Date.parse(raw.startedAt)) ||
      now-Date.parse(raw.startedAt)<0 || now-Date.parse(raw.startedAt)>24*60*60*1000 ||
      !raw.completed || typeof raw.completed!=='object' || Array.isArray(raw.completed))
    throw Error('Stale or incompatible Garmin sync progress')
  const completed=Object.keys(raw.completed)
  if (completed.some(id=>!ids.includes(id))) throw Error('Unexpected gear in progress')
  for (const id of completed) {
    if(!Array.isArray(raw.completed[id])) throw Error('Malformed checkpoint')
    for(const link of raw.completed[id]) {
      if(link?.gearId!==id || !/^\d{5,20}$/.test(link.activityId||'')) throw Error('Invalid checkpoint link')
    }
  }
  return raw
}
export function saveGearScanResult(state,gearId,raw) {
  const id=canonicalGearId(gearId)
  if(!id || !state.gearIds.includes(id) || Object.hasOwn(state.completed,id))
    throw Error('Unrecognized or already scanned gear')
  const mapped=normalizeGearActivities(raw,gearId).map(x=>({
    activityId:x.activityId,gearId:id
  }))
  const unique=new Set(mapped.map(x=>x.activityId))
  if(unique.size!==mapped.length) throw Error('Duplicate gear/activity pair')
  if(Object.keys(state.completed).length>=state.gearIds.length) throw Error('Unexpected scan size')
  return {...state,completed:{...state.completed,[id]:mapped}}
}
export function finishGearScan(state) {
  const ids=state.gearIds
  if(Object.keys(state.completed).length!==ids.length ||
    ids.some(id=>!Array.isArray(state.completed[id]))) throw Error('Scan incomplete')
  const links=ids.flatMap(id=>state.completed[id])
  if(links.length>3000) throw Error('Snapshot exceeds safe link limit')
  const unique=new Set(links.map(x=>x.activityId+':'+x.gearId))
  if(unique.size!==links.length) throw Error('Duplicate associations')
  return links
}
export function compareLinkSets(before,after) {
  const key=x=>String(x.activityId)+':'+canonicalGearId(x.gearId)
  const b=new Set((Array.isArray(before)?before:[]).map(key))
  const a=new Set(after.map(key))
  return {added:[...a].filter(x=>!b.has(x)).length,
    removed:[...b].filter(x=>!a.has(x)).length}
}

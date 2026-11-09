/**
 * GARMIN_AI v0.7.7 – full-catalog read-only preview. No Supabase writes.
 * Reuse the existing strict allowlist and truncation guards. No scoring.
 */
import {gearRows,scheduledRows,ensureNonemptyKnownShape} from '../garmin-connect-model.mjs'
import {normalizeGearActivities,normalizeUuid} from '../garmin-gear-history-model.mjs'

const canonical=x=>typeof x==='string'&&/^[a-f0-9]{32}$/i.test(x.replace(/-/g,''))?
  normalizeUuid(x):null

export function buildCloudPreview({rawGear,rawCalendar,activityLists,baseline,windowStart=null,windowEnd=null}) {
  const gear=ensureNonemptyKnownShape(rawGear,gearRows(rawGear),'gear')
  if(gear.length<1||gear.length>100)throw Error('Garmin gear catalog incomplete or too large')
  const ids=gear.map(g=>canonical(g.id))
  if(ids.some(x=>!x)||new Set(ids).size!==ids.length)
    throw Error('Invalid or duplicate Garmin gear identifiers')
  // An unknown Garmin status must never silently classify a retired shoe as active.
  if(gear.every(g=>g.status==='unknown'))throw Error('Garmin gear statuses unrecognized')
  const calendar=ensureNonemptyKnownShape(rawCalendar,scheduledRows(rawCalendar),'calendar')
  if(calendar.length>500)throw Error('Calendar exceeds safe limit')
  if(!Array.isArray(activityLists)||activityLists.length!==gear.length)
    throw Error('Partial Garmin gear history')
  const links=gear.flatMap((g,i)=>normalizeGearActivities(activityLists[i],g.id))
  if(links.length>3000)throw Error('Full history exceeds safe limit')
  const seen=new Set()
  for(const link of links){
    const key=link.activityId+':'+canonical(link.gearId)
    if(seen.has(key))throw Error('Duplicate Garmin gear history link')
    seen.add(key)
  }
  const old=Array.isArray(baseline?.activity_gear)?baseline.activity_gear:[]
  const previous=new Set(old.map(l=>String(l.activityId)+':'+canonical(l.gearId)))
  if(previous.has('undefined:null'))throw Error('Baseline history corrupted')
  const previousGear=Array.isArray(baseline?.gear)?baseline.gear:[]
  const pastIds=new Set(previousGear.map(g=>canonical(g.id)))
  if(pastIds.has(null))throw Error('Baseline gear identifier invalid')
  // Never accept truncated catalog accidentally dropping retired gear:
  // a disappearance requires manual investigation before any replacement.
  const removedGear=[...pastIds].filter(x=>!ids.includes(x))
  if(removedGear.length)throw Error('Garmin catalog is missing previously known gear')
  // Compare only the same date range. The prior snapshot may cover
  // a different window; otherwise we'd invent deleted workouts.
  const within=(w)=>(!windowStart||w.date>=windowStart)&&(!windowEnd||w.date<=windowEnd)
  const previousSchedule=(Array.isArray(baseline?.schedule)?baseline.schedule:[]).filter(within)
  const key=w=>JSON.stringify([w.date,w.id??null,w.workoutId??null,w.name??null,w.sport??null,w.restDay===true])
  const scheduleBefore=new Set(previousSchedule.map(key))
  const scheduleAfter=new Set(calendar.filter(within).map(key))
  return {
    checkedAt:new Date().toISOString(),complete:true,
    totals:{gear:gear.length,links:links.length,scheduled:calendar.length},
    // Strictly normalized complete read, never an untrusted raw Garmin response.
    snapshot:{gear,schedule:calendar,activityGear:links},
    differences:{
      gearAdded:ids.filter(id=>!pastIds.has(id)).length,
      linksAdded:[...seen].filter(k=>!previous.has(k)).length,
      linksRemoved:[...previous].filter(k=>!seen.has(k)).length,
      calendarAdded:[...scheduleAfter].filter(k=>!scheduleBefore.has(k)).length,
      calendarRemoved:[...scheduleBefore].filter(k=>!scheduleAfter.has(k)).length
    }
  }
}

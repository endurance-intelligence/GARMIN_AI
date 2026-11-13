/** GARMIN_AI P3: read-only, conservative training-plan ↔ Garmin run evidence.
 * Never treats matching by date alone as proof the planned workout was executed.
 * No Garmin write, no plan modification and no generated fitness/readiness score.
 */
const RUN_SPORTS=new Set(['running','track_running','treadmill_running','ultra_run'])
const ISO=/^\d{4}-\d{2}-\d{2}$/
const HM=/^([01]\d|2[0-3]):([0-5]\d)$/
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x)
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null
const fmtDuration=s=>Number.isFinite(s)?Math.round(s/60):null
const parseDate=value=>typeof value==='string'&&ISO.test(value.slice(0,10))?
 value.slice(0,10):null
const parseMinute=value=>{
 if(typeof value!=='string')return null
 const time=value.trim().replace('T',' ').slice(11,16)
 const match=HM.exec(time)
 return match?Number(match[1])*60+Number(match[2]):null
}
const expectedSeconds=plan=>{
 const snap=plan?.archive_snapshot
 if(!isObject(snap)||snap.sourceKind!=='coach')return null
 const warmup=num(snap.warmup?.durationSeconds)
 const cooldown=num(snap.cooldown?.durationSeconds)
 const steps=snap.group?.steps
 if(!Array.isArray(steps)||!steps.length||steps.length>30)return null
 const secs=steps.map(x=>x?.endMode==='time'?num(x.durationSeconds):null)
 if(warmup===null||cooldown===null||secs.some(x=>x===null))return null
 const total=warmup+cooldown+secs.reduce((a,b)=>a+b,0)
 return Number.isSafeInteger(total)&&total>=600&&total<=7200?total:null
}
export function assessPlanActual(activity,allActivities,allPlans){
 if(!activity||typeof activity.id!=='string'||!RUN_SPORTS.has(activity.sport))
  return {status:'no-link',reason:'Keine gültige Garmin-Laufaktivität ausgewählt.',plan:null}
 const day=parseDate(activity.date)
 if(!day||!Array.isArray(allActivities)||!Array.isArray(allPlans))
  return {status:'unavailable',reason:'Aktivitäten oder Trainingsplan unvollständig.',plan:null}
 const plans=allPlans.filter(p=>p&&p.training_date===day&&
  p.state!=='cancelled'&&p.sport==='running')
 if(!plans.length)return {status:'no-plan',reason:'Für diesen Lauf ist kein GARMIN_AI-Lauftraining am selben Tag gespeichert.',plan:null}
 if(plans.length>1)return {status:'ambiguous',reason:'Mehr als ein Lauftraining für diesen Tag gespeichert. Keine automatische Zuordnung.',plan:null}
 const plan=plans[0]
 const duration=expectedSeconds(plan)
 if(duration===null)return {status:'unsupported',reason:'Der gespeicherte Plan ist kein eindeutig zeitgesteuertes Coach-Workout.',plan:null}
 const sameDayRuns=allActivities.filter(a=>a&&typeof a.id==='string'&&
  RUN_SPORTS.has(a.sport)&&parseDate(a.date)===day)
 if(sameDayRuns.length!==1||sameDayRuns[0].id!==activity.id)
  return {status:'ambiguous',reason:'Mehrere Garmin-Läufe am selben Tag oder Aktivitätsliste unvollständig. Keine automatische Zuordnung.',plan:null}
 const start=HM.exec(plan.archive_snapshot.startTime||'')
 const actualMinute=parseMinute(activity.date)
 if(!start||actualMinute===null)
  return {status:'possible',reason:'Plan- oder Garmin-Startzeit fehlt. Ein gleiches Datum beweist keine Workout-Zuordnung.',plan:null}
 const intendedMinute=Number(start[1])*60+Number(start[2])
 const delta=Math.abs(actualMinute-intendedMinute)
 if(delta>90)return {status:'possible',reason:'Lauf am selben Tag, aber mehr als 90 Minuten von der geplanten Startzeit entfernt. Keine sichere Zuordnung.',plan:null}
 const actualSeconds=num(activity.durationS)
 const kind=plan.archive_snapshot.coachKind
 return {
  status:'matched',reason:'Ein eindeutiger Garmin-Lauf am Plandatum mit höchstens 90 Minuten Startabweichung. Plausible Zuordnung, kein Nachweis des exakten Garmin-Workout-Schrittablaufs.',
  plan:{id:plan.id,title:plan.title,day,coachKind:kind,
   plannedStart:plan.archive_snapshot.startTime,
   actualStart:activity.date,plannedSeconds:duration,actualSeconds,
   plannedMinutes:fmtDuration(duration),actualMinutes:fmtDuration(actualSeconds),
   durationDeltaMinutes:actualSeconds===null?null:Math.round((actualSeconds-duration)/60),
   avgHr:num(activity.avgHr),distanceM:num(activity.distanceM),
   activityId:activity.id,startDeltaMinutes:delta}
 }
}

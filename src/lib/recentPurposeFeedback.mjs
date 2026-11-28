import {assessPlanActual} from './planActual.mjs'
import {normalizeGarminRpe} from './garminPerception.mjs'
import {assessTrainingPurpose,measuredHrExposure} from './trainingPurposeAssessment.mjs'
const low=new Set(['easy','long','return_easy','recovery'])
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const day=a=>String(a.date||'').slice(0,10)
export function recentEasyCandidates({today,boards,plans}={}){
 if(!validDay(today)||!Array.isArray(boards)||!Array.isArray(plans))return []
 const unique=new Map()
 for(const b of boards)for(const a of b?.activities||[]){
  if(a?.activity_id==null||!a.start_time_local)continue
  unique.set(String(a.activity_id),{id:String(a.activity_id),date:a.start_time_local,sport:a.sport_type,
   durationS:a.duration_s,distanceM:a.distance_m,avgHr:a.average_heart_rate,rpeRaw:a.rpe_raw})
 }
 const activities=[...unique.values()]
 return activities.filter(a=>day(a)>=shift(today,-2)&&day(a)<=today).flatMap(activity=>{
  const match=assessPlanActual(activity,activities,plans)
  return match.status==='matched'&&low.has(match.plan.coachKind)?[{activity,match}]:[]
 }).sort((a,b)=>String(b.activity.date).localeCompare(String(a.activity.date)))
}
/** Historical profile must precede the local activity DAY (UTC timestamp
 * converted to Berlin date). A same-day profile with uncertain time is not
 * assumed to have been active at the start. No guessed LT1. */
export function priorGarminUpper(profiles,activityDate){
 if(!Array.isArray(profiles))return null
 const candidates=profiles.filter(p=>{
  const t=Date.parse(p?.observed_at)
  if(!Number.isFinite(t))return false
  const d=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t))
  return d<activityDate&&p?.profile?.sport==='running'
 }).sort((a,b)=>String(b.observed_at).localeCompare(String(a.observed_at)))
 const z=candidates[0]?.profile?.zones
 return Array.isArray(z)&&z.length===5&&z.every((x,i)=>Number.isInteger(x)&&x>=70&&x<=230&&(i===0||x>z[i-1]))&&z[4]>=125?z[1]:null
}
export function compactPurposeExposure(activity,samples,upperBpm){
 if(!activity||!finite(activity.durationS)||activity.durationS<=0||!Array.isArray(samples))return null
 const exposure=measuredHrExposure(samples,upperBpm)
 // Require observed HF duration to cover most of the whole activity, not
 // only a short high-HR fragment. Keep approximate elapsed weighting explicit.
 if(!exposure||exposure.validSeconds/activity.durationS<.70||exposure.validSeconds/activity.durationS>1.25)return null
 return {activityId:activity.id,source:'garmin-historical',...exposure}
}
export function recentPurposeFeedback({today,boards,plans,evidence}={}){
 const rows=recentEasyCandidates({today,boards,plans})
 const findings=rows.flatMap(({activity,match})=>{
  const x=Array.isArray(evidence)?evidence.find(e=>e?.activityId===activity.id&&e.source==='garmin-historical'&&finite(e.upperBpm)&&e.upperBpm>=70&&e.upperBpm<=220&&finite(e.aboveShare)&&e.aboveShare>=0&&e.aboveShare<=100&&finite(e.validSeconds)&&finite(e.aboveSeconds)&&e.aboveSeconds>=0&&e.aboveSeconds<=e.validSeconds&&Math.abs(e.aboveSeconds/e.validSeconds*100-e.aboveShare)<.1&&e.coverage>=.75&&finite(activity.durationS)&&e.validSeconds>=activity.durationS*.7&&e.validSeconds<=activity.durationS*1.25):null
  const assessed=assessTrainingPurpose({activity,match,rpe:normalizeGarminRpe(activity.rpeRaw),hrExposure:x||null})
  return assessed?.mode==='caution'?[{activityId:activity.id,date:day(activity),kind:assessed.kind,reason:assessed.recommendation,until:shift(day(activity),2),objective:!!x&&x.aboveShare>=40&&x.aboveSeconds>=600}]:[]
 })
 return {active:findings.length>0,findings,latest:findings[0]||null}
}

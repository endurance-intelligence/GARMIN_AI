/**
 * Conservative race-to-Garmin reconciliation.
 * Automatic linkage still requires a unique same-day distance match.
 * An athlete MAY explicitly confirm a shorter same-day Garmin run,
 * without changing recorded distance, time or subjective feedback.
 */
import {normalizeGarminRpe,normalizeGarminFeeling} from './garminPerception.mjs'
const valid=n=>typeof n==='number'&&Number.isFinite(n)
const raceSport=s=>typeof s==='string'&&/run|trail|ultra|treadmill/i.test(s)
const idSafe=x=>(typeof x==='string'||typeof x==='number')&&
 /^[A-Za-z0-9_-]{1,100}$/.test(String(x))
const sanitizeText=(s,n=120)=>typeof s==='string'?
 s.replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,n):''

/** Only genuine imported, time-stamped running activities from the event day.
 * Never infer race participation from the fact that the day matches alone.
 */
export function listRaceDayActivities({raceDate,board}={}){
 if(typeof raceDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raceDate))
  return []
 const rows=Array.isArray(board?.activities)?board.activities:[]
 const byId=new Map()
 for(const a of rows){
  if(!a||!idSafe(a.activity_id)||typeof a.start_time_local!=='string'||
   a.start_time_local.slice(0,10)!==raceDate||
   !raceSport(a.sport_type)||!valid(a.duration_s)||a.duration_s<=0||
   !valid(a.distance_m)||a.distance_m<=0)continue
  const key=String(a.activity_id),previous=byId.get(key)
  const weight=x=>Number(valid(x.rpe_raw))+Number(valid(x.feeling_raw))+
   Number(typeof x.activity_name==='string'&&x.activity_name.trim().length>0)
  if(!previous||weight(a)>weight(previous))byId.set(key,a)
 }
 return [...byId.values()].sort((a,b)=>
  String(a.start_time_local).localeCompare(String(b.start_time_local)))
  .map(a=>({
   activityId:String(a.activity_id),
   activityName:sanitizeText(a.activity_name)||'Garmin-Lauf',
   date:raceDate,clock:String(a.start_time_local).slice(11,16),
   distanceKm:Math.round(a.distance_m/100)/10,
   durationMinutes:Math.round(a.duration_s/60)
  })).slice(0,30)
}

export function assessRaceOutcome({raceDate,raceName='',raceDistanceKm,plannedMinutes,
 board,checks,links=[]}){
 const ids=listRaceDayActivities({raceDate,board})
 const raw=Array.isArray(board?.activities)?board.activities:[]
 const matching=ids.filter(x=>valid(raceDistanceKm)&&raceDistanceKm>0&&
  Math.abs(x.distanceKm-raceDistanceKm)<=Math.max(2,raceDistanceKm*.08))
 const explicit=Array.isArray(links)?links.find(l=>
  l?.raceDate===raceDate&&l?.raceName===raceName&&
  typeof l?.activityId==='string'&&ids.some(x=>x.activityId===l.activityId)):null
 const selection=explicit?ids.find(x=>x.activityId===explicit.activityId):
  matching.length===1?matching[0]:null
 const found=selection?raw.filter(x=>String(x?.activity_id)===selection.activityId&&
  typeof x?.start_time_local==='string'&&x.start_time_local.slice(0,10)===raceDate&&
  raceSport(x.sport_type)).sort((a,b)=>
   Number(normalizeGarminRpe(b.rpe_raw)!==null)+Number(normalizeGarminFeeling(b.feeling_raw)!==null)-
   Number(normalizeGarminRpe(a.rpe_raw)!==null)-Number(normalizeGarminFeeling(a.feeling_raw)!==null))[0]:null
 const current=Array.isArray(checks)?checks.filter(c=>c?.raceDate===raceDate&&
  typeof c.reportedOn==='string').sort((a,b)=>b.reportedOn.localeCompare(a.reportedOn))[0]:null
 const time=found?Math.round(found.duration_s/60):null
 const actualKm=found?Math.round(found.distance_m/100)/10:null
 const partial=actualKm!==null&&valid(raceDistanceKm)&&
  actualKm<raceDistanceKm-Math.max(2,raceDistanceKm*.08)
 // A full-distance planned finish time must never be compared to a partial run.
 const diff=!partial&&time!==null&&valid(plannedMinutes)?
  time-Math.round(plannedMinutes):null
 const matchStatus=found?(explicit?'confirmed':'unique'):
  matching.length>1?'ambiguous':'unavailable'
 return {matchStatus,matchSource:explicit?'athlete':'distance',
  partial,actualKm,actualMinutes:time,planDeltaMinutes:diff,
  activityId:found?String(found.activity_id):null,
  garminRpe:found?normalizeGarminRpe(found.rpe_raw):null,
  garminFeeling:found?normalizeGarminFeeling(found.feeling_raw):null,
  raceCheck:current?{reportedOn:current.reportedOn,fatigue:current.fatigue,
   soreness:current.soreness,warning:current.warning===true}:null,
  source:explicit?'Vom Athleten bestätigte Garmin-Aufzeichnung des Renntags':
   'Garmin-Aufzeichnung mit plausibel passendem Datum und Renndistanz',
  caveat:(partial?
   'Der Wettkampf wurde vor Erreichen der geplanten Distanz beendet. '+
   'Die vollständige Zielzeit wird deshalb nicht mit der tatsächlichen Laufzeit verglichen. ':'')+
   'Garmin-Dauer kann Pausen anders erfassen als die Planung. Aus einer Aktivität '+
   'lassen sich tatsächlich gegessene Kohlenhydrate und Trinkmenge nicht belegen.'}
}

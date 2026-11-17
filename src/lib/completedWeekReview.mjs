/**
 * Last completed ISO week, Garmin evidence vs user-approved GARMIN_AI plans.
 * A same-day activity is not proof of plan execution: reuse strict time and
 * structured-snapshot matching from the existing Session Intelligence audit.
 * Read-only. No invented "missed" sessions, readiness score or plan writes.
 */
import {assessPlanActual} from './planActual.mjs'
import {coachMonday,coachAddDays} from './coachSevenDay.mjs'

const hasDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const valid=n=>typeof n==='number'&&Number.isFinite(n)
const runSport=s=>typeof s==='string'&&
 /^(running|track_running|treadmill_running|ultra_run|trail_running)$/.test(s.toLowerCase())
const roundedKm=m=>Math.round(m/100)/10
const beforeStart=(today)=>coachAddDays(coachMonday(today),-7)
const toMinutes=sec=>valid(sec)&&sec>0?Math.round(sec/60):null

export function summarizeLastCompletedWeek(input){
 const today=input?.today
 if(!hasDate(today))throw Error('Ungültiges Coach-Datum')
 const start=beforeStart(today)
 const end=coachAddDays(start,6)
 const empty={status:'unavailable',start,end,runCount:null,distanceKm:null,
  trainingMinutes:null,manualCount:null,approvedPlans:null,matchedCount:null,
  unlinkedPlans:null,extraRuns:null,overlongCount:0,deltaMinutes:null,
  adjustment:'none',title:'Letzte Woche noch nicht vollständig verfügbar',
  summary:'Der Garmin-Wochenbericht fehlt. Keine Plan-Ist-Aussage und keine automatische Anpassung.',
  next:'Garmin synchronisieren und anschließend die Woche erneut prüfen.',
  examples:[]}
 const board=(Array.isArray(input?.boards)?input.boards:[]).find(b=>b?.start===start&&
  Array.isArray(b.activities)&&Array.isArray(b.manual))
 if(!board)return empty
 const actual=[...new Map(board.activities.filter(a=>
  a&&typeof a.activity_id==='string'&&a.activity_id&&
  typeof a.start_time_local==='string'&&a.start_time_local.slice(0,10)>=start&&
  a.start_time_local.slice(0,10)<=end
 ).map(a=>[a.activity_id,a])).values()]
 const runs=actual.filter(a=>runSport(a.sport_type))
 const unknownDistances=runs.some(a=>!valid(a.distance_m)||a.distance_m<0)
 const distanceKm=unknownDistances?null:roundedKm(runs.reduce((sum,a)=>sum+a.distance_m,0))
 const allDurationKnown=actual.every(a=>valid(a.duration_s)&&a.duration_s>=0)
 const manual=board.manual.filter(x=>x&&x.session_date>=start&&x.session_date<=end)
 const allManualMinutes=manual.every(x=>valid(x.duration_minutes)&&x.duration_minutes>=0)
 const trainingMinutes=allDurationKnown&&allManualMinutes?
  Math.round(actual.reduce((sum,a)=>sum+a.duration_s,0)/60)+
   manual.reduce((sum,a)=>sum+a.duration_minutes,0):null
 const plans=Array.isArray(input?.plans?.entries)?input.plans.entries:[]
 const approved=plans.filter(p=>p&&p.training_date>=start&&p.training_date<=end&&
  p.sport==='running'&&['pending','confirmed'].includes(p.state))
 const normalizedRuns=runs.map(a=>({
  id:a.activity_id,date:a.start_time_local,sport:(
   a.sport_type==='trail_running'?'running':a.sport_type),
  durationS:valid(a.duration_s)?a.duration_s:null,
  avgHr:valid(a.average_heart_rate)?a.average_heart_rate:null,
  distanceM:valid(a.distance_m)?a.distance_m:null
 }))
 const matches=normalizedRuns.map(a=>assessPlanActual(a,normalizedRuns,approved))
  .filter(m=>m.status==='matched'&&m.plan&&m.plan.actualSeconds!==null)
 // Protect against a bad schema / duplicate assignment even if activity data is stale.
 const uniqueMatches=[...new Map(matches.map(x=>[x.plan.id,x])).values()]
 const matchedIds=new Set(uniqueMatches.map(m=>m.plan.activityId))
 const unlinkedPlans=Math.max(0,approved.length-uniqueMatches.length)
 const extraRuns=runs.length-matchedIds.size
 const durationDeltas=uniqueMatches.map(x=>x.plan.durationDeltaMinutes)
 const overlong=uniqueMatches.filter(x=>x.plan.durationDeltaMinutes!==null&&
  x.plan.durationDeltaMinutes>=Math.max(15,Math.round(x.plan.plannedMinutes*.3)))
 const adjustment=overlong.length>=2?'shorten':'none'
 const examples=uniqueMatches.slice(0,4).map(x=>({
  title:x.plan.title,date:x.plan.day,
  plannedMinutes:x.plan.plannedMinutes,actualMinutes:x.plan.actualMinutes,
  deltaMinutes:x.plan.durationDeltaMinutes
 }))
 const summary=runs.length+' echte Garmin-'+(runs.length===1?'Laufeinheit':'Laufeinheiten')+
  (distanceKm===null?' (Distanz unvollständig)':' · '+distanceKm.toLocaleString('de-DE')+' km')+
  '. '+uniqueMatches.length+' von '+approved.length+
  ' freigegebenen Coach-Läufen zeitlich plausibel zugeordnet.'
 const next=adjustment==='shorten'?
  'Zwei oder mehr plausibel zugeordnete Läufe dauerten deutlich länger als geplant. Den nächsten noch offenen lockeren Lauf etwas kürzen – nicht nachholen.':
  approved.length>0&&unlinkedPlans>0?
   'Nicht zugeordnete Termine sind nicht automatisch ausgefallen. Erst Kalender und Garmin-Aufzeichnungen prüfen.':
   runs.length===0?'Keine Laufaktivität in Garmin erfasst. Das beweist nicht, dass du nicht trainiert hast.':
   'Kein klares Plan-Ist-Signal für eine Kürzung. Die nächsten Einheiten weiterhin nach Erholung und deinem Feedback planen.'
 return {status:'ready',start,end,runCount:runs.length,distanceKm,trainingMinutes,
  manualCount:manual.length,approvedPlans:approved.length,
  matchedCount:uniqueMatches.length,unlinkedPlans,extraRuns,
  overlongCount:overlong.length,
  deltaMinutes:durationDeltas.length?durationDeltas.reduce((a,b)=>a+b,0):null,
  adjustment,title:'Deine letzte Trainingswoche',summary,next,examples}
}

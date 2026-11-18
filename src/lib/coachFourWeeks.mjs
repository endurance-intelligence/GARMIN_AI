/**
 * Four completed ISO weeks: choices, approved Coach plans, Garmin activity and
 * athlete's own Garmin RPE/feeling. No fake compliance/performance percentage.
 * Read-only: a date match alone is NOT proof of execution of a Coach workout.
 */
import {assessPlanActual} from './planActual.mjs'
import {normalizeGarminRpe,normalizeGarminFeeling} from './garminPerception.mjs'

const DAY=86400000
const RUN=new Set(['running','track_running','treadmill_running','ultra_run','trail_running'])
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const add=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*DAY).toISOString().slice(0,10)
const monday=s=>add(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7))
const number=x=>typeof x==='number'&&Number.isFinite(x)
const dayOf=x=>typeof x==='string'?x.slice(0,10):''
const empty=(start,end)=>({start,end,available:false,runs:null,distanceKm:null,
 rated:null,hard:null,weak:null,longestRunMinutes:null,approved:null,matched:null,overlong:null,
 accepted:null,declined:null,planCoverage:false})

export function analyzeCoachFourWeeks({today,boards,plans,life}={}){
 const unavailable={status:'unavailable',weeks:[],completeWeeks:0,
  totalRuns:null,totalRated:null,totalMatched:null,qualityCaution:false,
  repeatedToughWeeks:0,title:'Mehrwöchiger Verlauf nicht verfügbar',
  explanation:'Garmin-Wochen, Coach-Entscheidungen oder Planhistorie können fehlen. Keine Folgerung aus Datenlücken.',
  suggestion:'Erst die historischen Garmin-Daten prüfen. Keine automatische Planänderung.'}
 if(!validDate(today)||!Array.isArray(boards)||!Array.isArray(plans?.entries))
  return unavailable
 const weekStart=monday(today)
 const starts=Array.from({length:4},(_,i)=>add(weekStart,-7*(i+1)))
 const historyFrom=validDate(plans.historyFrom)?plans.historyFrom:null
 const decisionRows=Array.isArray(life?.context?.day_decisions)?life.context.day_decisions:[]
 const weeks=starts.map(start=>{
  const end=add(start,6)
  const board=boards.find(b=>b?.start===start&&Array.isArray(b.activities))
  if(!board)return empty(start,end)
  const byId=new Map()
  for(const a of board.activities){
   if(!a||!RUN.has(String(a.sport_type||''))||(
    typeof a.activity_id!=='string'&&typeof a.activity_id!=='number'))continue
   const id=String(a.activity_id),d=dayOf(a.start_time_local)
   if(!id||!validDate(d)||d<start||d>end)continue
   const prev=byId.get(id)
   const quality=x=>Number(number(x.duration_s))+Number(number(x.distance_m))+
    Number(normalizeGarminRpe(x.rpe_raw)!==null)+Number(normalizeGarminFeeling(x.feeling_raw)!==null)
   if(!prev||quality(a)>quality(prev))byId.set(id,a)
  }
  const runRows=[...byId.values()]
  const runs=runRows.map(a=>({
   id:String(a.activity_id),date:a.start_time_local,
   sport:a.sport_type==='trail_running'?'running':a.sport_type,
   durationS:number(a.duration_s)?a.duration_s:null,
   avgHr:number(a.average_heart_rate)?a.average_heart_rate:null,
   distanceM:number(a.distance_m)?a.distance_m:null
  }))
  const timed=runRows.filter(a=>number(a.duration_s)&&a.duration_s>=300&&a.duration_s<=86400)
  const longestRunMinutes=timed.length?Math.round(Math.max(...timed.map(a=>a.duration_s))/60):null
  const measured=runRows.filter(a=>number(a.distance_m)&&a.distance_m>=0)
  const km=measured.length===runRows.length?
   Math.round(measured.reduce((total,a)=>total+a.distance_m,0)/100)/10:null
  const rated=runRows.filter(a=>normalizeGarminRpe(a.rpe_raw)!==null||
   normalizeGarminFeeling(a.feeling_raw)!==null)
  const hard=runRows.filter(a=>{
   const rpe=normalizeGarminRpe(a.rpe_raw)
   const feel=normalizeGarminFeeling(a.feeling_raw)
   return (rpe!==null&&rpe>=8)||(feel!==null&&feel<=25)
  })
  const weak=runRows.filter(a=>{
   const feel=normalizeGarminFeeling(a.feeling_raw)
   return feel!==null&&feel<=25
  })
  const covered=historyFrom!==null&&start>=historyFrom
  const approved=covered?plans.entries.filter(p=>p&&p.training_date>=start&&
   p.training_date<=end&&p.sport==='running'&&
   ['pending','confirmed'].includes(p.state)):null
  const matched=covered?runs.map(a=>assessPlanActual(a,runs,approved))
   .filter(m=>m.status==='matched'&&m.plan):[]
  const unique=[...new Map(matched.map(m=>[m.plan.id,m])).values()]
  const overlong=unique.filter(m=>m.plan.actualMinutes!==null&&
   m.plan.durationDeltaMinutes!==null&&
   m.plan.durationDeltaMinutes>=Math.max(15,Math.ceil(m.plan.plannedMinutes*.3)))
  const choices=decisionRows.filter(x=>x&&x.date>=start&&x.date<=end)
  return {start,end,available:true,runs:runs.length,distanceKm:km,rated:rated.length,
   hard:hard.length,weak:weak.length,longestRunMinutes,approved:approved?.length??null,
   matched:covered?unique.length:null,overlong:covered?overlong.length:null,
   accepted:choices.filter(x=>x.choice==='accepted').length,
   declined:choices.filter(x=>x.choice==='declined').length,planCoverage:covered}
 })
 const available=weeks.filter(w=>w.available)
 if(!available.length)return {...unavailable,status:'empty',weeks,completeWeeks:0,
  title:'Noch kein vollständiger Wochenverlauf',
  explanation:'Die vier zurückliegenden Kalenderwochen wurden noch nicht geladen.'}
 const totalRuns=available.reduce((x,w)=>x+w.runs,0)
 const totalRated=available.reduce((x,w)=>x+w.rated,0)
 const covered=available.filter(w=>w.planCoverage)
 const totalMatched=covered.length===available.length?
  covered.reduce((x,w)=>x+w.matched,0):null
 const toughWeeks=available.filter(w=>w.hard>=1)
 const recentTough=weeks.slice(0,2).some(w=>w.available&&w.hard>=1)
 // A pattern needs 3 complete weeks, 4 genuine athlete ratings and
 // >=2 hard/weak sessions in at least two *different* weeks.
 const qualityCaution=available.length>=3&&totalRated>=4&&
  toughWeeks.length>=2&&recentTough
 const dataLimited=available.length<4||covered.length<available.length
 const explanation=qualityCaution?
  'Mindestens zwei abgeschlossene Wochen enthalten eine von dir als sehr hart bewertete Einheit oder ein schwaches Gefühl. Das ist ein Belastungssignal, kein Fitness-Score.':
  totalRated===0?'Für diese Wochen liegen keine Garmin-RPE- oder Gefühlsbewertungen vor.':
  'Die vorhandenen Garmin-Bewertungen zeigen kein hinreichend belegtes mehrwöchiges Warnmuster. Gute Werte sind keine Freigabe für mehr Intensität.'
 const suggestion=qualityCaution?
  'Keine zusätzliche harte Bahnoption aufgrund einer Sollquote. Bestehende Gruppen- und Kalendereinträge bitte selbst prüfen; lockere Einheiten bleiben locker.':
  'Keine automatische Steigerung oder Kürzung aus dem Vierwochenverlauf. Der aktuelle Coach berücksichtigt weiterhin Erholung, Rennphase und jüngstes Feedback.'
 return {status:dataLimited?'partial':'ready',weeks,completeWeeks:available.length,
  totalRuns,totalRated,totalMatched,qualityCaution,
  repeatedToughWeeks:toughWeeks.length,
  title:qualityCaution?'Mehrere anstrengende Wochen erkennbar':'Vier Wochen im Zusammenhang',
  explanation,suggestion}
}

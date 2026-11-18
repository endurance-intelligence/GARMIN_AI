/** Offline-first, explicit race checkpoint logging. No GPS or Garmin live claims.
 * The race plan is the athlete's saved/prepared strategy, not an ETA forecast.
 * All actual events require a click or manual entry.
 */
import {buildRaceExecution} from './raceExecution.mjs'
import {clockAt} from './gelTiming.mjs'

const DAY=86400000
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const minutes=n=>Number.isInteger(n)&&n>=0&&n<=2880
const clock=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const clean=o=>o&&typeof o==='object'&&!Array.isArray(o)?o:{}
export const formatRaceElapsed=n=>minutes(n)?
 String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):'–'
export function parseRaceElapsed(raw){
 if(typeof raw!=='string'||!/^\d{1,2}:[0-5]\d$/.test(raw.trim()))return null
 const [h,m]=raw.trim().split(':').map(Number),n=h*60+m
 return minutes(n)?n:null
}
/** Called on direct tap only; never silently advances live progress. */
export function raceElapsedNow({raceDate,startTime,now=new Date()}={}){
 if(!validDay(raceDate)||!clock(startTime)||!(now instanceof Date)||
  !Number.isFinite(now.getTime()))return null
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',
  year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now)
 const part=k=>parts.find(x=>x.type===k)?.value||''
 const date=part('year')+'-'+part('month')+'-'+part('day')
 if(!validDay(date))return null
 const days=(Date.parse(date+'T12:00:00Z')-
  Date.parse(raceDate+'T12:00:00Z'))/DAY
 const elapsed=days*1440+Number(part('hour'))*60+
  Number(part('minute'))-Number(startTime.slice(0,2))*60-Number(startTime.slice(3,5))
 return minutes(elapsed)?elapsed:null
}
export function recordRaceMark(marks,checkpoints,index,kind,elapsed){
 const source=clean(marks),items=Array.isArray(checkpoints)?checkpoints:[]
 const point=items.find(x=>x.index===index)
 if(!point||!['arrival','departure'].includes(kind)||!minutes(elapsed))
  return {ok:false,reason:'Abschnitt oder Zeit ungültig.',marks:source}
 if(kind==='departure'&&point.finish)
  return {ok:false,reason:'Nach dem Ziel gibt es keinen Weiterlauf.',marks:source}
 const previous=index>1?clean(source[String(index-1)]):null
 const current=clean(source[String(index)])
 const next=clean(source[String(index+1)])
 const prevArrival=previous?.arrivalMinutes
 const prevDeparture=previous?.departureMinutes
 const curArrival=current.arrivalMinutes
 const curDeparture=current.departureMinutes
 const nextArrival=next.arrivalMinutes
 if(kind==='arrival'){
  if(index>1&&!minutes(prevArrival))
   return {ok:false,reason:'Zuerst die vorherige Ankunft erfassen.',marks:source}
  if((minutes(prevDeparture)&&elapsed<prevDeparture)||
   (minutes(prevArrival)&&elapsed<prevArrival)||
   (minutes(curDeparture)&&elapsed>curDeparture)||
   (minutes(nextArrival)&&elapsed>nextArrival))
   return {ok:false,reason:'Ankunft widerspricht der zeitlichen Reihenfolge.',marks:source}
 }else if(!minutes(curArrival))
  return {ok:false,reason:'Zuerst die Ankunft dieser Runde erfassen.',marks:source}
 else if(elapsed<curArrival||(minutes(nextArrival)&&elapsed>nextArrival))
  return {ok:false,reason:'Weiterlauf widerspricht der Ankunft oder Folgerunde.',marks:source}
 const update={...current,[kind==='arrival'?'arrivalMinutes':'departureMinutes']:elapsed}
 return {ok:true,reason:null,marks:{...source,[String(index)]:update}}
}
export function sanitizeRaceMarks(marks,checkpoints){
 const from=clean(marks),result={}
 for(const c of checkpoints||[]){
  const src=clean(from[String(c.index)])
  if(minutes(src.arrivalMinutes)){
   const a=recordRaceMark(result,checkpoints,c.index,'arrival',src.arrivalMinutes)
   if(a.ok)Object.assign(result,a.marks)
  }
  if(minutes(src.departureMinutes)&&!c.finish){
   const d=recordRaceMark(result,checkpoints,c.index,'departure',src.departureMinutes)
   if(d.ok)Object.assign(result,d.marks)
  }
 }
 return result
}
export function undoLastRaceMark(marks,checkpoints){
 const source=sanitizeRaceMarks(marks,checkpoints)
 const latest=[...checkpoints].reverse().find(c=>minutes(source[String(c.index)]?.arrivalMinutes))
 if(!latest)return {ok:false,marks:source,reason:'Noch kein erfasster Abschnitt.'}
 const key=String(latest.index),entry={...source[key]},copy={...source}
 if(minutes(entry.departureMinutes))delete entry.departureMinutes
 else delete entry.arrivalMinutes
 if(Object.keys(entry).length)copy[key]=entry
 else delete copy[key]
 return {ok:true,marks:copy,reason:null}
}
export function buildRaceDayCockpit({input,marks={},startTime=null}={}){
 const race=buildRaceExecution(input)
 if(race.status!=='ready'||!race.estimate||!race.checkpoints.length)
  return {status:'missing',rows:[],next:null,latest:null,buffer:null,
   finished:false,plan:race,marks:{}}
 const cleaned=sanitizeRaceMarks(marks,race.checkpoints)
 const rows=race.checkpoints.map(c=>{
  const actual=clean(cleaned[String(c.index)])
  const arrival=minutes(actual.arrivalMinutes)?actual.arrivalMinutes:null
  const departure=minutes(actual.departureMinutes)?actual.departureMinutes:null
  return {...c,arrival,departure,
   plannedClock:clock(startTime)?clockAt(startTime,c.arrivalMinutes):null,
   actualClock:arrival!==null&&clock(startTime)?clockAt(startTime,arrival):null,
   arrivalDelta:arrival===null?null:c.arrivalMinutes-arrival,
   departureDelta:departure===null?null:c.departureMinutes-departure}
 })
 const latest=[...rows].reverse().find(r=>r.arrival!==null)||null
 const lastAction=latest?latest.departure!==null&&
  (latest.departure>=latest.arrival)?
  {kind:'departure',point:latest,actualMinutes:latest.departure,
   plannedMinutes:latest.departureMinutes}:
  {kind:'arrival',point:latest,actualMinutes:latest.arrival,
   plannedMinutes:latest.arrivalMinutes}:null
 const buffer=lastAction&&race.target?Math.round(race.target.remaining+
  lastAction.plannedMinutes-lastAction.actualMinutes):null
 const finished=Boolean(latest?.finish&&latest.arrival!==null)
 const unrecorded=rows.find(r=>r.arrival===null)||null
 const next=finished?null:unrecorded
 return {status:'ready',plan:race,rows,marks:cleaned,latest,lastAction,
  next,buffer,finished,
  recorded:rows.filter(r=>r.arrival!==null).length,
  targetMinutes:race.target?.minutes??null}
}
export function raceDayLogText({goal,model,startTime}){
 const lines=['GARMIN_AI · RACE DAY PROTOKOLL',
  String(goal?.race_name||'Rennen')+' · '+String(goal?.race_date||''),
  'Startzeit: '+(clock(startTime)?startTime+' Uhr':'nicht hinterlegt'),
  'Zeitangaben ab Start · manuell bestätigt, kein Garmin-Livetracking','']
 for(const r of model?.rows||[])
  lines.push('Abschnitt '+r.index+' · '+r.distanceKm+' km · Soll '+
   formatRaceElapsed(r.arrivalMinutes)+' · Ist '+
   (r.arrival===null?'offen':formatRaceElapsed(r.arrival))+
   (r.finish?' · ZIEL':' · Weiter '+
    (r.departure===null?'offen':formatRaceElapsed(r.departure))))
 lines.push('','Die Werte sind selbst erfasste Zwischenzeiten; keine automatisch gemessenen Garmin-Daten.')
 return lines.join('\n')
}

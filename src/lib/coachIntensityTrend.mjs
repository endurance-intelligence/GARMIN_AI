/**
 * Read-only retrospective comparison of Garmin device HR-zone time.
 * Periods: 4 completed ISO weeks per block, newest first.
 * Never interprets Garmin zones as measured LT1/LT2, training readiness,
 * workout permissions, or personalized intensity prescriptions.
 */
import {longTermWeekStarts} from './coachLongTerm.mjs'
import {classifyGarminHrSeconds} from './coachHrTime.mjs'
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const percentage=(a,b)=>b>0?Math.round(a/b*1000)/10:null
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const int=n=>Number.isInteger(n)&&n>=0
const labels=['Letzte 4 Wochen','Davor 4 Wochen','Älteste 4 Wochen']
const phaseNames={
 base:'Grundlage',build:'Aufbau',specific:'Wettkampfspezifisch',
 peak:'Letzter Trainingsblock',taper:'Tapering',
 race:'Renntag',recovery:'Regeneration',expired:'Abgeschlossen'
}
const emptyBlock=(index,starts)=>({
 index,label:labels[index],start:starts[3]||null,end:starts[0]||null,
 receivedWeeks:0,measuredWeeks:0,activities:0,measuredActivities:0,
 excludedActivities:0,activityCoverage:null,recordingCoverage:null,
 measuredSeconds:0,bands:null,ready:false,reason:'Keine vollständigen FIT-Zeitdaten.'
})
function validRow(row,start){
 if(row?.start!==start||row?.readOnly!==true||
  !int(row.totalActivities)||!int(row.measuredActivities)||
  !int(row.skippedActivities)||row.measuredActivities+row.skippedActivities!==row.totalActivities||
  !finite(row.validSeconds)||row.validSeconds<0||
  !finite(row.measuredExpectedSeconds)||row.measuredExpectedSeconds<0||
  !row.histogram||typeof row.histogram!=='object'||Array.isArray(row.histogram))
  return false
 let seconds=0
 for(const [k,v] of Object.entries(row.histogram)){
  const bpm=Number(k)
  if(!Number.isInteger(bpm)||bpm<35||bpm>220||!finite(v)||v<0)return false
  seconds+=v
 }
 if(Math.abs(seconds-row.validSeconds)>Math.max(.1,row.validSeconds*.001))return false
 if(row.validSeconds>row.measuredExpectedSeconds*1.08)return false
 return true
}
export function analyzeGarminIntensityTrend({today,weeks=8,weekRows=[],
 profile=null,goal=null}={}){
 const starts=longTermWeekStarts(today,weeks)
 const phase=typeof goal?.phase==='string'&&Object.hasOwn(phaseNames,goal.phase)?
  goal.phase:null
 const goalValid=validDate(goal?.race_date)&&
  typeof goal?.race_name==='string'&&goal.race_name.trim().length>0
 const goalContext=goalValid?{
  name:goal.race_name.trim(),raceDate:goal.race_date,
  phase,phaseLabel:phase?phaseNames[phase]:'Nicht bestimmt',
  protected:['peak','taper','race','recovery'].includes(phase)
 }:null
 const missing={status:'incomplete',comparable:false,trend:'unknown',
  weeksRequested:weeks,blocks:[],changes:null,goal:goalContext,
  title:'Noch kein belastbarer Vierwochenvergleich',
  detail:'Für einen Vergleich brauchen wir in beiden Zeiträumen vollständige Wochen und ausreichend FIT-HF-Zeit. Fehlende Trainingsdaten sind unbekannt, nicht null.',
  readOnly:true,source:'Gemessene Garmin-FIT-Sekunden · aktuelle Garmin-Laufzonen'}
 if(!starts.length||!Array.isArray(weekRows))return missing
 const found=new Map()
 // Ignore duplicate API responses: a second week must never double the seconds.
 for(const row of weekRows){
  const start=typeof row?.start==='string'?row.start:''
  if(!starts.includes(start)||found.has(start)||!validRow(row,start))continue
  found.set(start,row)
 }
 const blocks=Array.from({length:weeks/4},(_,index)=>{
  const expected=starts.slice(index*4,(index+1)*4)
  const rows=expected.map(s=>found.get(s)).filter(Boolean)
  const hr=classifyGarminHrSeconds(rows,profile)
  const initial=emptyBlock(index,expected)
  const measuredWeeks=rows.filter(row=>row.measuredActivities>0&&row.validSeconds>0).length
  const activityCoverage=percentage(hr.measuredActivities,hr.activities)
  const recordingCoverage=hr.coveredPercent
  const reason=rows.length!==4?
   'Mindestens eine abgeschlossene Garmin-Woche fehlt.':
   measuredWeeks<3?
   'Weniger als drei Wochen mit ausreichend gemessener HF-Zeit.':
   hr.measuredActivities<4?
   'Zu wenige vollständig aufgezeichnete Laufsessions.':
   activityCoverage===null||activityCoverage<75?
   'Ein zu großer Teil der aufgezeichneten Läufe hat keine nutzbare FIT-HF-Zeit.':
   recordingCoverage===null||recordingCoverage<75?
   'Die Messzeit deckt die aufgezeichneten Laufzeiten nicht ausreichend ab.':
   hr.measuredSeconds<7200?
   'Weniger als zwei Stunden nutzbare HF-Zeit in diesem Vierwochenblock.':
   hr.status==='no-zones'?'Persönliche Garmin-Laufzonen fehlen.':null
  const ready=reason===null&&hr.status==='measured'
  const low=hr.zoneSeconds?
   hr.zoneSeconds[0]+hr.zoneSeconds[1]+hr.zoneSeconds[2]:0
  const middle=hr.zoneSeconds?hr.zoneSeconds[3]:0
  const upper=hr.zoneSeconds?
   hr.zoneSeconds[4]+hr.zoneSeconds[5]+hr.zoneSeconds[6]:0
  const bands=hr.status==='measured'?[
   {key:'low',label:'Unter Z1 + Z1–Z2',seconds:low,share:percentage(low,hr.measuredSeconds)},
   {key:'middle',label:'Garmin Z3',seconds:middle,share:percentage(middle,hr.measuredSeconds)},
   {key:'upper',label:'Garmin Z4–Z5 + darüber',seconds:upper,
    share:percentage(upper,hr.measuredSeconds)}
  ]:null
  return {...initial,receivedWeeks:rows.length,measuredWeeks,
   activities:hr.activities,measuredActivities:hr.measuredActivities,
   excludedActivities:hr.skippedActivities,
   activityCoverage,recordingCoverage,
   measuredSeconds:hr.measuredSeconds,bands,ready,reason}
 })
 const [current,previous]=blocks
 const comparable=Boolean(current.ready&&previous.ready)
 const changes=comparable?{
  low:Math.round((current.bands[0].share-previous.bands[0].share)*10)/10,
  middle:Math.round((current.bands[1].share-previous.bands[1].share)*10)/10,
  upper:Math.round((current.bands[2].share-previous.bands[2].share)*10)/10
 }:null
 const swing=comparable?Math.max(...Object.values(changes).map(Math.abs)):0
 const trend=!comparable?'unknown':swing<5?'similar':
  changes.upper>=5?'more-upper':
  changes.upper<=-5?'less-upper':
  changes.middle>=5?'more-middle':
  changes.middle<=-5?'less-middle':
  changes.low>=5?'more-low':'less-low'
 const title=!comparable?'Noch kein belastbarer Vierwochenvergleich':
  trend==='similar'?'Garmin-HF-Zeitanteile ähnlich verteilt':
  'Garmin-HF-Zeitanteile haben sich verschoben'
 const detail=!comparable?
  'Nicht alle vier Wochen je Block sind vollständig erfasst oder die FIT-HF-Abdeckung ist zu gering. '+
   'Aus einzelnen guten Aufzeichnungen wird kein Trainingstrend abgeleitet.':
  'Letzte vier abgeschlossene Wochen gegenüber den vier davor: '+
   'unter Z1 bis Z2 '+(changes.low>=0?'+':'')+changes.low.toLocaleString('de-DE')+
   ' Prozentpunkte; Garmin Z3 '+(changes.middle>=0?'+':'')+
   changes.middle.toLocaleString('de-DE')+' Prozentpunkte; Garmin Z4–Z5 und darüber '+
   (changes.upper>=0?'+':'')+changes.upper.toLocaleString('de-DE')+
   ' Prozentpunkte. Diese Verschiebung beschreibt die Aufzeichnung, nicht Leistung oder Erholungsstatus.'
 return {...missing,status:comparable?'ready':'incomplete',
  comparable,trend,blocks,changes,title,detail}
}

/**
 * Garmin-backed post-race context. Read-only: race recognition is only a
 * plausible unique date/distance match, never an official finish certificate.
 * Missing Garmin data or self ratings must never be interpreted as recovery.
 */
import {assessRaceOutcome} from './raceOutcome.mjs'
const DAY=86400000
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const shift=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*DAY).toISOString().slice(0,10)
const numeric=n=>typeof n==='number'&&Number.isFinite(n)
const median=nums=>{
 const a=[...nums].sort((x,y)=>x-y),mid=Math.floor(a.length/2)
 return a.length?a.length%2?a[mid]:(a[mid-1]+a[mid])/2:null
}
const blank=(status='missing')=>({
 status,raceDate:null,raceName:null,daysSince:null,phase:'none',
 title:'Wettkampfnachbereitung',next:'Renn- und Garmin-Daten für die Auswertung fehlen.',
 matchStatus:'unavailable',activityId:null,actualMinutes:null,actualKm:null,
 garminRpe:null,garminFeeling:null,signals:[],recoveryCaution:false,
 source:'Garmin · echte Aktivitäten und Tagesmessungen',
 checked:false,check:null,healthEvidence:0,objectiveRecoveryUnknown:true,
 careNote:'Keine automatisch erteilte Trainingsfreigabe.'
})
const labels={
 0:['race','Renntag · Ruhe und Versorgung',
  'Nach dem Rennen trinken, essen, umziehen und ausruhen. Keine weitere Trainingseinheit.'],
 1:['rest','Erst regenerieren',
  'Keine Trainingseinheit. Erholung und normales Alltagsgefühl haben Vorrang.'],
  2:['rest','Erst regenerieren',
  'Keine Trainingseinheit. Erholung und normales Alltagsgefühl haben Vorrang.'],
  3:['protect','Erholung und Alltag',
  'Nur sanfte Alltagsbewegung, sofern gut verträglich. Keine Laufeinheit ergänzen.'],
  4:['protect','Erholung und Alltag',
  'Nur sanfte Alltagsbewegung, sofern gut verträglich. Keine Laufeinheit ergänzen.'],
  5:['protect','Erholung und Alltag',
  'Nur sanfte Alltagsbewegung, sofern gut verträglich. Keine Laufeinheit ergänzen.']
}
export function analyzeAutoRaceRecovery({today,goal,boards=[],health={},life={}}={}){
 const raceDate=goal?.race_date
 if(!isDate(today)||!isDate(raceDate)||!(Number(goal?.distance_km)>0))
  return blank()
 const daysSince=Math.round((Date.parse(today+'T12:00:00Z')-
  Date.parse(raceDate+'T12:00:00Z'))/DAY)
 if(daysSince<0)return {...blank('upcoming'),raceDate,
  raceName:String(goal.race_name||'Wettkampf'),daysSince,
  title:'Wettkampf steht bevor',next:'Die Garmin-Auswertung startet nach dem Wettkampftag.'}
 if(daysSince>21)return {...blank('outside'),raceDate,
  raceName:String(goal.race_name||'Wettkampf'),daysSince,
  title:'Rückblick abgeschlossen',next:'Die automatische 21-Tage-Rennphase ist beendet.'}
 const activities=Array.isArray(boards)?boards.flatMap(b=>Array.isArray(b?.activities)?b.activities:[]):[]
 const checks=Array.isArray(life?.context?.race_recovery_checks)?
  life.context.race_recovery_checks:[]
 const outcome=assessRaceOutcome({raceDate,raceDistanceKm:Number(goal.distance_km),
  plannedMinutes:null,board:{activities},checks})
 const validCheck=outcome.raceCheck&&isDate(outcome.raceCheck.reportedOn)&&
  outcome.raceCheck.reportedOn<=today?outcome.raceCheck:null
 const metrics=Array.isArray(health?.metrics)?health.metrics:[]
 const signals=[]
 let healthEvidence=0
 const definitions=[
  ['hrv_ms',10,250,'HRV gegenüber den 14 Tagen vor dem Rennen deutlich niedriger',
   (value,base)=>value<base*.8],
  ['resting_heart_rate',25,110,'Ruhepuls gegenüber den 14 Tagen vor dem Rennen deutlich höher',
   (value,base)=>value>=base+7],
  ['sleep_seconds',10800,57600,'Schlafdauer gegenüber den 14 Tagen vor dem Rennen deutlich kürzer',
   (value,base)=>value<=base-3600]
 ]
 for(const [field,min,max,label,bad] of definitions){
  const baseline=metrics.filter(x=>x?.metric_date>=shift(raceDate,-14)&&
   x.metric_date<raceDate&&numeric(x[field])&&x[field]>=min&&x[field]<=max)
   .map(x=>x[field])
  const recent=metrics.filter(x=>x?.metric_date>raceDate&&x.metric_date<=today&&
   x.metric_date>=shift(today,-2)&&numeric(x[field])&&x[field]>=min&&x[field]<=max)
   .sort((a,b)=>b.metric_date.localeCompare(a.metric_date))[0]
  if(baseline.length<7||!recent)continue
  const normal=median(baseline)
  healthEvidence++
  if(bad(recent[field],normal))signals.push(label)
 }
 if(outcome.garminRpe!==null&&outcome.garminRpe>=8)
  signals.push('Wettkampf in Garmin als sehr anstrengend bewertet')
 if(outcome.garminFeeling!==null&&outcome.garminFeeling<=25)
  signals.push('Garmin-Gefühl nach dem Wettkampf schwach')
 if(validCheck?.warning)
  signals.push('Du hast ungewöhnliche Warnzeichen gemeldet')
 if(validCheck&&Math.max(Number(validCheck.fatigue),Number(validCheck.soreness))>=7)
  signals.push('Deine letzte Erholungseinschätzung zeigt hohe Belastung')
 const recoveryCaution=signals.length>0
 let phase,title,next
 if(daysSince<=5)[phase,title,next]=labels[daysSince]
 else if(daysSince<=9){
  phase='observe';title='Schrittweise in den Alltag zurück'
  next='Leichte Spaziergänge oder sanfte Mobility nach Wohlbefinden. '+
   'Noch keinen Trainingsumfang nachholen und keine Intervalle.'
 }else if(daysSince<=14){
  phase='return';title='Behutsamen Wiedereinstieg prüfen'
  next='Erst wenn du beschwerdefrei bist und dich gut erholt fühlst, '+
   'eine kurze, sehr lockere Einheit bewusst prüfen. Keine automatische Trainingsfreigabe.'
 }else{
  phase='rebuild';title='Ruhigen Aufbau prüfen'
  next='Allmählich zur gewohnten Routine zurückkehren, wenn die Erholung passt. '+
   'Keine versäumten Kilometer nachholen; Intensität erst später gezielt planen.'
 }
 if(recoveryCaution)next='Die vorhandenen Garmin-/Erholungsangaben sprechen für mehr Ruhe. '+
  'Keine Intensität und keine Umfangssteigerung. Bei ungewöhnlichen Symptomen medizinisch abklären.'
 const status=outcome.matchStatus==='unique'?'matched':
  outcome.matchStatus==='ambiguous'?'ambiguous':'awaiting-sync'
 return {status,raceDate,raceName:String(goal.race_name||'Wettkampf'),
  daysSince,phase,title,next,matchStatus:outcome.matchStatus,
  activityId:outcome.activityId,actualMinutes:outcome.actualMinutes,
  actualKm:outcome.actualKm,garminRpe:outcome.garminRpe,
  garminFeeling:outcome.garminFeeling,
  signals,recoveryCaution,healthEvidence,
  objectiveRecoveryUnknown:healthEvidence<2,checked:!!validCheck,check:validCheck,
  source:'Garmin · eindeutige Aktivität nach Datum und Distanz, eigene Garmin-Bewertungen und Erholungsmessungen',
  careNote:status==='matched'?
   'Zuordnung plausibel anhand Garmin-Datum und -Distanz; kein amtliches Rennergebnis. '+
   'Gute Messwerte allein erlauben keine Rückkehr zum Laufen.':
   status==='ambiguous'?'Mehrere unterschiedliche Garmin-Läufe passen; keine automatische Zuordnung.':
    'Noch keine eindeutig passende Garmin-Aufzeichnung. Eine spätere Synchronisierung ist möglich.'}
}

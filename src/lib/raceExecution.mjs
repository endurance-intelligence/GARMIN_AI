import {estimateRaceStrategy} from './raceStrategyMath.mjs'
/** Athlete-entered pacing/fueling arithmetic. No nutritional prescription. */
export function estimateRaceBudget({distanceKm,targetHours,calculation,
 carbsPerHour,fluidPerHour,sodiumPerHour}={}){
 const finite=n=>typeof n==='number'&&Number.isFinite(n)
 const total=calculation&&finite(calculation.totalMinutes)&&calculation.totalMinutes>0?
  calculation.totalMinutes:null
 const moving=calculation&&finite(calculation.movingMinutes)&&calculation.movingMinutes>0?
  calculation.movingMinutes:null
 const hours=total===null?null:total/60
 const target=finite(targetHours)&&targetHours>0&&targetHours<=100?
  Math.round(targetHours*60):null
 const valid=(value,max)=>finite(value)&&value>=0&&value<=max?value:null
 const carbs=valid(carbsPerHour,150),fluid=valid(fluidPerHour,1500),
  sodium=valid(sodiumPerHour,3000)
 const totalOf=(value)=>hours===null||value===null?null:Math.round(value*hours)
 const pace=finite(distanceKm)&&distanceKm>0&&moving!==null?
  Math.round(moving*60/distanceKm):null
 return {
  hours,totalMinutes:total,estimatedMovingPaceSeconds:pace,
  targetMinutes:target,marginMinutes:total!==null&&target!==null?target-total:null,
  plannedCarbsGrams:totalOf(carbs),plannedFluidMl:totalOf(fluid),
  plannedSodiumMg:totalOf(sodium),
  completeFuel:carbs!==null&&fluid!==null,
  note:'Rechenhilfe aus deinen Zielwerten pro Gesamtstunde einschließlich Pausen. '+
   'Keine Trink- oder Ernährungs-Empfehlung und kein Beleg, was du im Rennen wirklich zu dir nimmst.'
 }
}
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const ordinal=d=>Math.round(Date.parse(d+'T12:00:00Z')/86400000)
const actualRuns=(board,raceDate)=>Array.isArray(board?.activities)?
 [...new Map(board.activities.filter(a=>
  a&&String(a.start_time_local||'').slice(0,10)===raceDate&&
  /run|jog/i.test(String(a.sport_type||''))&&
  (typeof a.activity_id==='string'||typeof a.activity_id==='number')
 ).map(a=>[String(a.activity_id),a])).values()]:[]
const numeric=n=>typeof n==='number'&&Number.isFinite(n)
export function buildRaceReview({today,race,strategy,board,context}={}){
 if(!validDate(today)||!validDate(race?.raceDate)||
  typeof race?.raceName!=='string'||!race.raceName.trim())
  return {status:'unknown',message:'Kein früheres Rennen eindeutig zugeordnet.',
   race:null,garmin:null,recovery:null,plan:null,following:'Keine Ergebnisse schätzen.'}
 const elapsedDays=ordinal(today)-ordinal(race.raceDate)
 if(elapsedDays<0)return {status:'upcoming',message:'Das Rennen liegt noch vor dir.',
  race,garmin:null,recovery:null,plan:null,following:'Am Renntag nach Plan laufen.'}
 const checks=Array.isArray(context?.race_recovery_checks)?
  context.race_recovery_checks.filter(x=>x&&x.raceDate===race.raceDate&&
   validDate(x.reportedOn)&&x.reportedOn<=today&&
   Number.isInteger(x.fatigue)&&Number.isInteger(x.soreness)&&
   x.fatigue>=0&&x.fatigue<=10&&x.soreness>=0&&x.soreness<=10):[]
 const recovery=checks.length?
  [...checks].sort((a,b)=>b.reportedOn.localeCompare(a.reportedOn))[0]:null
 const dist=numeric(race.distanceKm)&&race.distanceKm>0?race.distanceKm:null
 const mode=String(strategy?.course_mode||'laps')
 const base={
  distanceKm:dist,courseMode:mode,
  loopKm:numeric(strategy?.loop_km)?strategy.loop_km:null,
  movingMinutes:numeric(strategy?.moving_minutes_per_loop)?
   strategy.moving_minutes_per_loop:null,
  regularPauseMinutes:numeric(strategy?.pause_minutes_per_loop)?
   strategy.pause_minutes_per_loop:null,
  longStopEvery:numeric(strategy?.long_stop_every)?strategy.long_stop_every:null,
  longStopMinutes:numeric(strategy?.long_stop_minutes)?strategy.long_stop_minutes:null,
  paceSeconds:numeric(strategy?.target_pace_seconds)?strategy.target_pace_seconds:null
 }
 const laps=mode==='laps'&&numeric(base.loopKm)&&base.loopKm>0&&
  numeric(base.movingMinutes)&&base.movingMinutes>0
 const validPlan=(mode!=='laps'&&numeric(base.paceSeconds))||laps
 const plan=validPlan&&dist!==null?
  estimateRaceStrategy({...base}):null
 const hasBoard=board&&board.start===monday(race.raceDate)&&
  Array.isArray(board.activities)
 const runs=hasBoard?actualRuns(board,race.raceDate):[]
 const candidates=dist===null?[]:runs.filter(a=>
  numeric(a.distance_m)&&a.distance_m>0&&
  a.distance_m>=dist*1000*.8&&a.distance_m<=dist*1000*1.2)
 const match=candidates.length===1?candidates[0]:null
 const status=!hasBoard?'no-garmin-week':dist===null?'no-distance':
  candidates.length>1?'ambiguous':!match?'not-matched':'matched'
 const actual=match?{
  activityId:String(match.activity_id),date:race.raceDate,
  recordedKm:Math.round(match.distance_m/100)/10,
  activityMinutes:numeric(match.duration_s)&&match.duration_s>0?
   Math.round(match.duration_s/60):null,
  avgPaceSeconds:numeric(match.duration_s)&&match.duration_s>0?
   Math.round(match.duration_s/match.distance_m*1000):null
 }:null
 const message={
  'no-garmin-week':'Garmin-Woche noch nicht abrufbar. Keine Rennauswertung ohne Trainingsdaten.',
  'no-distance':'Renndistanz fehlt. Keine automatische Zuordnung möglich.',
  'ambiguous':'Mehrere Garmin-Aktivitäten passen zur Renndistanz. Keine davon automatisch wählen.',
  'not-matched':runs.length?
   'Garmin-Läufe am Renntag vorhanden, aber kein eindeutiger Distanztreffer. '+
   'Abgebrochene oder in mehrere Aktivitäten geteilte Rennen werden nicht erraten.':
   'Noch keine eindeutig passende Garmin-Rennaktivität erfasst. '+
   'Das ist kein Nachweis, dass du nicht gestartet bist.',
  matched:'Eine Garmin-Laufaktivität passt zu Datum und Renndistanz. '+
   'Die Zuordnung ist plausibel, keine bestätigte offizielle Zielzeit.'
 }[status]
 const following=recovery?.warning?
  'Warnzeichen sind gemeldet. Belastung nicht automatisch steigern und medizinisch abklären.':
  !recovery?'Nach dem Rennen den vorhandenen Erholungs-Check beim Coach ausfüllen.':
  Math.max(recovery.fatigue,recovery.soreness)>=7?
   'Dein letzter Erholungs-Check spricht für weitere Ruhe. Keine versäumten Einheiten nachholen.':
   'Erholungs-Check weiter beobachten. Eine niedrige Erschöpfung allein ist keine Freigabe für hartes Training.'
 return {status,message,race,garmin:actual,recovery,plan,following,
  timingNote:'Garmin-Aktivitätsdauer und offizielles Rennergebnis sind nicht dasselbe. '+
   'Pausen und Unterbrechungen können anders gezählt werden.',
  fuelingNote:'Garmin zeichnet nicht zuverlässig auf, welche Gels und Getränke du tatsächlich '+
   'eingenommen hast. Die geplante Menge wird nicht als konsumiert gewertet.'
 }
}
function monday(date){
 const d=new Date(date+'T12:00:00Z')
 return new Date(d.getTime()-((d.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10)
}

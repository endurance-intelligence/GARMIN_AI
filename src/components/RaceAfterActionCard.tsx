import {useEffect,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import {berlinDateToday} from '../lib/coachGoal'
import {coachMonday} from '../lib/coachSevenDay.mjs'
import {assessRaceOutcome} from '../lib/raceOutcome.mjs'
import type {RaceOutcome} from '../lib/raceOutcome.mjs'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from './Icon'
import '../styles/race-after-action.css'

const clock=(mins:number)=>Math.floor(mins/60)+'h '+String(mins%60).padStart(2,'0')+'m'
export function RaceAfterActionCard({goal,plannedMinutes,onCoach}:{
 goal:CoachGoal;plannedMinutes:number|null;onCoach:()=>void
}){
 const [outcome,setOutcome]=useState<RaceOutcome|null>(null)
 const [pending,setPending]=useState(false)
 const [error,setError]=useState('')
 const raceEnded=goal.race_date<berlinDateToday()
 useEffect(()=>{
  if(!raceEnded||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setPending(true);setError('');setOutcome(null)
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const headers={authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   const [week,context]=await Promise.all([
    fetch(garminSupabaseUrl+'/functions/v1/garmin-week-board?start='+
     encodeURIComponent(coachMonday(goal.race_date)),{cache:'no-store',signal:controller.signal,headers}),
    fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-context',{
     cache:'no-store',signal:controller.signal,headers})
   ])
   if(!week.ok||!context.ok)throw Error('Rennnachbereitung derzeit nicht erreichbar.')
   const [board,life]=await Promise.all([week.json(),context.json()])
   if(mounted)setOutcome(assessRaceOutcome({
    raceDate:goal.race_date,raceDistanceKm:Number(goal.distance_km),
    plannedMinutes,board,checks:life?.context?.race_recovery_checks
   }))
  })().catch(e=>{if(mounted&&e?.name!=='AbortError')
   setError(e instanceof Error?e.message:'Ergebnisdaten nicht verfügbar.')})
   .finally(()=>{if(mounted)setPending(false)})
  return ()=>{mounted=false;controller.abort()}
 },[raceEnded,goal.race_date,goal.distance_km,plannedMinutes])
 if(!raceEnded)return null
 return <section className="raa-root" aria-label="Rennnachbereitung mit echten Garmin-Daten">
  <div className="raa-heading">
   <Icon name="check-circle"/>
   <div><small>NACH DEM ZIEL · DEIN RÜCKBLICK</small>
    <strong>Plan, tatsächlicher Lauf &amp; Erholung</strong>
    <p>Garmin-Daten prüfen, damit der nächste Trainingsblock sinnvoll startet.</p></div>
  </div>
  {pending&&<p className="raa-note" role="status">Prüfe deine Garmin-Aufzeichnung …</p>}
  {error&&<p className="raa-note" role="alert">{error}</p>}
  {outcome&&<>
   {outcome.matchStatus==='unique'?<div className="raa-result">
    <div><small>Gelaufen · Garmin</small>
     <strong>{outcome.actualKm?.toLocaleString('de-DE')} km</strong>
     <span>{clock(outcome.actualMinutes!)}</span></div>
    <div><small>Vergleich mit Rennplan</small>
     <strong>{outcome.planDeltaMinutes===null?'Keine Planzeit':
      (outcome.planDeltaMinutes>0?'+':'')+outcome.planDeltaMinutes+' Min.'}</strong>
     <span>{outcome.planDeltaMinutes===null?'Keine passende Planzeit hinterlegt':
      'Reiner Zeitvergleich; keine Leistungsbewertung'}</span></div>
   </div>:<p className="raa-note">
    {outcome.matchStatus==='ambiguous'?
     'Mehrere Garmin-Läufe passen zu Datum und Distanz. Keine automatische Ergebniszuordnung.':
     'Noch kein eindeutig passender Garmin-Lauf für den Wettkampf gefunden.'}
    {' '}Deine Rennaufzeichnung kann später nachsynchronisiert werden.</p>}
   {outcome.matchStatus==='unique'&&(outcome.garminRpe!==null||
     outcome.garminFeeling!==null)&&<p className="raa-note">
    Dein Garmin-Feedback zum Rennen:
    {outcome.garminRpe!==null?' Anstrengung '+outcome.garminRpe+'/10.':''}
    {outcome.garminFeeling!==null?' Gefühl '+
     ({0:'sehr schwach',25:'schwach',50:'normal',75:'gut',100:'sehr gut'} as Record<number,string>)[outcome.garminFeeling]+'.':''}
    {' '}Automatisch übernommen, keine zweite Bewertung nötig.
   </p>}
   {outcome.raceCheck?<p className="raa-note">
    Dein Erholungs-Check vom {outcome.raceCheck.reportedOn.split('-').reverse().join('.')}:
    Erschöpfung {outcome.raceCheck.fatigue}/10 · Beine {outcome.raceCheck.soreness}/10.
    {outcome.raceCheck.warning?' Warnzeichen gemeldet – medizinisch abklären.':''}
   </p>:<p className="raa-note">Kein persönlicher Erholungs-Check vorhanden – dieser ist optional. Garmin-RPE und -Gefühl werden unabhängig davon berücksichtigt.</p>}
   <p className="raa-note">{outcome.caveat}</p>
  </>}
  <button type="button" className="raa-coach" onClick={onCoach}>
   <Icon name="activity"/> Erholungs-Barometer im Coach öffnen <Icon name="arrow-up-right"/>
  </button>
 </section>
}

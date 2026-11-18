import type {AutoRaceRecovery} from '../lib/raceRecoveryIntelligence.mjs'
import {Icon} from './Icon'
import '../styles/coach-race-recovery.css'
const h=(minutes:number)=>Math.floor(minutes/60)+'h '+String(minutes%60).padStart(2,'0')+'m'
export function CoachRaceRecoveryCard({review,onRacePrep}:{
 review:AutoRaceRecovery;onRacePrep?:()=>void
}){
 if(review.daysSince===null||review.daysSince<0||review.daysSince>21)return null
 const matched=review.status==='matched'
 const label=review.daysSince===0?'Renntag':review.daysSince+'. Tag danach'
 return <section className="crr-root" aria-label="Automatische Rennnachbereitung und Erholung">
  <header className="crr-head">
   <span className="crr-icon"><Icon name="heart-pulse"/></span>
   <span className="crr-copy">
    <small>COACH · AUTOMATISCHE WETTKAMPFNACHBEREITUNG</small>
    <strong>{review.title}</strong>
    <span>{review.raceName} · {label}</span>
   </span>
  </header>
  <div className="crr-body">
   <p className="crr-next">{review.next}</p>
   {matched?<div className="crr-source">
    <Icon name="check-circle"/>
    <div><strong>Garmin-Aufzeichnung eindeutig zugeordnet</strong>
     <span>{review.actualKm?.toLocaleString('de-DE',{maximumFractionDigits:1})} km
      {review.actualMinutes!==null?' · aufgezeichnete Dauer '+h(review.actualMinutes):''}
      {' · '}kein amtliches Rennergebnis</span>
     {review.garminRpe!==null&&<span>Dein Garmin-RPE: {review.garminRpe}/10</span>}
     {review.garminFeeling!==null&&<span>Garmin-Gefühl: {
      ({0:'sehr schwach',25:'schwach',50:'normal',75:'gut',100:'sehr gut'} as Record<number,string>)[review.garminFeeling]
     }</span>}
    </div>
   </div>:<p className="crr-pending"><Icon name="info"/>
    {review.careNote}</p>}
   {review.signals.length>0&&<div className="crr-warnings">
    <strong><Icon name="alert-triangle"/> Erholungssignale beachten</strong>
    <p>{review.signals.join(' · ')}</p>
   </div>}
   <div className="crr-foot">
    <p>{review.healthEvidence>0?
     review.healthEvidence+' Erholungskennzahlen mit ausreichenden Garmin-Vorher/Nachher-Daten verglichen. ':
     'Für einen belastbaren Vorher/Nachher-Vergleich der Erholungskennzahlen fehlen derzeit Daten. '}
     Gute Messwerte beweisen keine vollständige Regeneration.
     Deine Rückmeldung im Erholungs-Barometer ist optional; vorhandenes Garmin-RPE
     und Garmin-Gefühl werden direkt übernommen.
     Keine automatische Garmin- oder Kalenderänderung.</p>
    {onRacePrep&&<button type="button" onClick={onRacePrep}>
     Rennrückblick unter Race Prep <Icon name="arrow-up-right"/></button>}
   </div>
  </div>
 </section>
}

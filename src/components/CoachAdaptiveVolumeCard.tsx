import type {AdaptiveVolume} from '../lib/coachAdaptiveVolume.mjs'
import '../styles/coach-adaptive-volume.css'

const label=(status:AdaptiveVolume['status'])=>({
 progress:'Vorsichtiger Aufbau',reduce:'Umfang reduzieren',maintain:'Konstant bleiben',
 protected:'Erholung / Wettkampf',insufficient:'Datenbasis aufbauen'
})[status]
export function CoachAdaptiveVolumeCard({review}:{review:AdaptiveVolume}){
 const changed=Boolean(review.appliedDate)
 return <details className="cav-root" aria-label="Coach: adaptive Umfangssteuerung und Begründung">
  <summary className="cav-summary">
   <span className="cav-mark" aria-hidden="true">↗</span>
   <span className="cav-title">
    <small>COACH / ADAPTIVE UMFANGSSTEUERUNG</small>
    <strong>{review.title}</strong>
    <span>{changed?'Ein noch offener Vorschlag wurde angepasst · bitte selbst freigeben':
     label(review.status)+' · keine Planänderung'}</span>
   </span>
   <span className="cav-chevron" aria-hidden="true">⌄</span>
  </summary>
  <div className="cav-body">
   <p>{review.reason}</p>
   {review.latestKm!==null&&review.baselineKm!==null&&
    <div className="cav-evidence">
     <span>Letzte abgeschlossene Garmin-Woche:
      <strong> {review.latestKm.toLocaleString('de-DE',{maximumFractionDigits:1})} km</strong></span>
     <span>Median der beiden Vorwochen:
      <strong> {review.baselineKm.toLocaleString('de-DE',{maximumFractionDigits:1})} km</strong></span>
    </div>}
   {changed&&<p className="cav-applied">
    Vorschlag für {review.appliedDate.slice(8,10)+'.'+review.appliedDate.slice(5,7)+'.'}:
    {' '}{review.changeMinutes>0?'+':''}{review.changeMinutes} Minuten für
    <strong> einen</strong> noch offenen langen Lauf. Erst nach persönlicher Freigabe.
   </p>}
   <p className="cav-disclaimer">Die Werte stammen aus Garmin-Aktivitäten.
    Laufkilometer sind keine Intensitätszonen und kein Fitness-Score. Fehlende
    Wochen, Trainingsfeedback und deine Rennphase begrenzen Vorschläge.
    Bereits bestätigte Kalendertermine oder Garmin-Daten werden nicht verändert.</p>
  </div>
 </details>
}

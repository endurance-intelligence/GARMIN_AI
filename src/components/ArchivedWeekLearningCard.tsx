import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import '../styles/coach-adaptive-volume.css'
const short=(date:string)=>date.slice(8,10)+'.'+date.slice(5,7)+'.'
const km=(n:number|null)=>n===null?'—':n.toLocaleString('de-DE',{maximumFractionDigits:1})+' km'
export function ArchivedWeekLearningCard({review}:{review:NonNullable<SevenDayPlan['archivedLearning']>}){
 return <details className="cav-root" aria-label="Coach-Lernschleife aus archivierten Trainingswochen">
  <summary className="cav-summary"><span className="cav-mark" aria-hidden="true">↗</span><span className="cav-title"><small>COACH / LERNSCHLEIFE</small><strong>Aus deinen Wochen lernen</strong><span>{review.caution?'Belastungsmuster erkannt':review.completeWeeks+' von 4 Wochen vergleichbar'}</span></span><span className="cav-chevron" aria-hidden="true">⌄</span></summary>
  <div className="cav-body"><p>{review.summary}</p>
   {review.weeks.map(w=><div className="cav-evidence" key={w.start}><strong>{short(w.start)} – {short(w.end)}</strong><span>{w.status==='unavailable'?'Kein vollständiges Wochenarchiv':w.status==='incomplete'?'Distanzen / Daten unvollständig':w.overload?'Umfang deutlich über Plan und hohe subjektive Belastung':'Vergleichbar'}</span>{w.status!=='unavailable'&&<span>Ursprünglich {km(w.originalKm)} · zuletzt geplant {km(w.plannedKm)} · tatsächlich {km(w.actualKm)}</span>}</div>)}
   {review.appliedDate&&<p className="cav-applied">Nächster offener Lauf am {short(review.appliedDate)} um fünf Minuten verkürzt. Nur ein Vorschlag.</p>}
   <p className="cav-disclaimer">Keine Bewertung deiner Disziplin aus Planabweichungen. Keine automatische Freigabe und keine Veränderung bestehender Termine.</p>
  </div>
 </details>
}

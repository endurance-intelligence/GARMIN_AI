import type {PlanActualMatch} from '../lib/planActual.mjs'
import '../styles/plan-actual-review.css'

const format=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const hhmm=(s:string)=>s.replace('T',' ').slice(11,16)
export function PlanActualReview({match,loading,error}:{
 match:PlanActualMatch|null;loading:boolean;error:string
}){
 if(loading)return <div className="par-card par-muted" role="status">
  <span className="par-label">PLAN ↔ IST / GARMIN_AI COACH</span>
  <p>Suche zugehöriges freigegebenes Training …</p>
 </div>
 if(error)return <div className="par-card par-muted" role="status">
  <span className="par-label">PLAN ↔ IST / DATENLÜCKE</span>
  <p>Trainingsplan derzeit nicht erreichbar. Keine Zuordnung behauptet.</p>
 </div>
 if(!match)return null
 if(match.status==='no-plan'||match.status==='no-link')return <div className="par-card par-muted">
  <span className="par-label">PLAN ↔ IST / OHNE ZUORDNUNG</span>
  <p>Kein passender Coach-Plan für diesen Lauf vorhanden. Die Garmin-Messwerte werden trotzdem unabhängig analysiert.</p>
 </div>
 if(match.status!=='matched'||!match.plan)return <div className="par-card par-muted" role="status">
  <span className="par-label">PLAN ↔ IST / NOCH OFFEN</span>
  <strong>Zuordnung nicht eindeutig</strong>
  <p>{match.reason}</p>
 </div>
 const plan=match.plan
 const deviation=plan.durationDeltaMinutes
 return <article className="par-card par-matched" aria-label="Plan-Ist-Vergleich der ausgewählten Garmin-Aktivität">
  <div className="par-header">
   <div><span className="par-label">SESSION INTELLIGENCE / PLAN ↔ IST</span>
    <h3>Coach-Training und Garmin-Lauf</h3></div>
   <span className="par-status">Plausibel zugeordnet</span>
  </div>
  <p className="par-plan">{plan.title}</p>
  <div className="par-metrics">
   <div><span>GEPLANT</span><strong>{plan.plannedMinutes} Min.</strong>
    <small>Start {plan.plannedStart} Uhr</small></div>
   <div><span>GEMESSEN / GARMIN</span><strong>{plan.actualMinutes===null?'–':plan.actualMinutes+' Min.'}</strong>
    <small>Start {hhmm(plan.actualStart)} Uhr</small></div>
   <div><span>DIFFERENZ</span>
    <strong>{deviation===null?'Nicht messbar':deviation===0?'0 Min.':(deviation>0?'+':'')+deviation+' Min.'}</strong>
    <small>Gemessene Dauer gegenüber Plan</small></div>
  </div>
  <p className="par-evidence">Garmin-Aufzeichnung: {plan.distanceM===null?'Distanz nicht verfügbar':format(plan.distanceM/1000)+' km'}
   {' · '}Ø Herzfrequenz {plan.avgHr===null?'nicht verfügbar':Math.round(plan.avgHr)+' bpm'}.
   {' '}Das sind Messwerte, keine Qualitätsnote.</p>
  <p className="par-caution">{match.reason} Der Plan gibt kein gemessenes Solltempo
   und keine individuell bestätigte HF-Grenze vor. Ob der Lauf wirklich locker war,
   lässt sich aus der Dauer allein nicht entscheiden.</p>
 </article>
}

import type {RecentCoachImpact} from '../lib/coachNextImpact.mjs'
import '../styles/coach-next-impact.css'

const fmt=(n:number|null)=>n===null?'–':n.toLocaleString('de-DE',{maximumFractionDigits:1})
const dt=(d:string)=>d.slice(8,10)+'.'+d.slice(5,7)+'.'
export function CoachNextImpactCard({impact}:{impact:RecentCoachImpact|null|undefined}){
 if(!impact?.latest)return null
 const item=impact.latest
 const changed=impact.effect==='shortened'
 return <article className={'cni-root'+(changed?' is-adjusted':'')}
  aria-label="Coach-Empfehlung aus Plan-Ist-Abgleich und Garmin-Bewertung">
  <div className="cni-head">
   <div><small>COACH · PLAN ↔ IST + DEIN GARMIN-FEEDBACK</small>
    <h3>Was bedeutet dein letzter zugeordneter Lauf?</h3></div>
   <span className="cni-status">{changed?'Vorschlag angepasst':'Prüfung abgeschlossen'}</span>
  </div>
  <p className="cni-activity">{dt(item.date)} · {item.title}</p>
  <div className="cni-metrics">
   <div><span>GEPLANT</span><strong>{fmt(item.plannedMinutes)} Min.</strong></div>
   <div><span>GARMIN · IST</span><strong>{fmt(item.actualMinutes)} Min.</strong></div>
   <div><span>DEINE RPE</span><strong>{item.rpe===null?'Nicht bewertet':item.rpe+'/10'}</strong></div>
  </div>
  {item.feeling&&<p className="cni-sub">Gefühl danach in Garmin: <strong>{item.feeling}</strong></p>}
  <p className="cni-interpretation">{impact.reason}</p>
  <p className="cni-result"><strong>Konsequenz:</strong> {impact.message||'Keine zusätzliche Planänderung.'}
   {impact.appliedDate?' Betroffener Vorschlag: '+dt(impact.appliedDate)+'.':''}</p>
  <p className="cni-note">Nur eine zeitlich plausible Zuordnung, kein Nachweis der exakt absolvierten
   Intervalle. Vorhandene Termine und bestätigte Trainings werden nicht geändert.</p>
 </article>
}

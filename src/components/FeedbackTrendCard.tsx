import {analyzeWorkoutFeedbackTrend} from '../lib/feedbackTrend.mjs'
import type {WorkoutFeedback} from '../lib/postWorkoutFeedback.mjs'
import {Icon} from './Icon'
import '../styles/feedback-trend.css'

export function FeedbackTrendCard({feedback,today}:{
 feedback:WorkoutFeedback[]|null|undefined;today:string
}){
 const trend=analyzeWorkoutFeedbackTrend(feedback,today)
 const hasEvidence=trend.count14>=3
 return <details className={'cft-root is-'+trend.level} aria-label="Dein persönlicher Trainingsfeedback-Verlauf">
  <summary className="cft-head">
   <span className="cft-head-icon"><Icon name="activity"/></span>
   <span className="cft-heading">
    <small>DEIN FEEDBACK / LETZTE 14 TAGE</small>
    <strong>{trend.title}</strong>
    <span>{trend.summary}</span>
   </span>
   <span className="cft-brief">{trend.count14} Einheiten<small>14 Tage</small></span>
   <Icon name="chevron-down"/>
  </summary>
  <div className="cft-details">
   {hasEvidence?<p className="cft-advice"><strong>So reagiert dein Coach:</strong> {trend.suggestion}</p>:
    <p className="cft-advice">Trage nach deinen nächsten Einheiten kurz ein, wie es sich angefühlt hat. Der Coach wartet auf genügend Rückmeldungen.</p>}
   <div className="cft-stats" aria-label="Zusammenfassung deiner echten Eingaben">
    <div><span>Rückmeldungen</span><strong>{trend.count14} / {trend.count28}</strong><small>14 / 28 Tage</small></div>
    <div><span>Sehr anstrengend</span><strong>{trend.highRpe14}</strong><small>8–10 von 10</small></div>
    <div><span>Schwere Beine</span><strong>{trend.heavyLegs14}</strong><small>14 Tage</small></div>
    <div><span>Beschwerden</span><strong>{trend.clearSymptoms14+trend.lightSymptoms14}</strong><small>14 Tage</small></div>
   </div>
   <p className="cft-foot">Das sind deine eigenen Angaben – keine automatisch geschätzte Fitness.
    Geplante Einheiten werden nur als Empfehlung angepasst. Du behältst die Freigabe.</p>
  </div>
 </details>
}

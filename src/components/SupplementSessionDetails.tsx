import type {GoalSupplementSuggestion} from '../lib/goalTrainingFocus.mjs'
import '../styles/coach-daily-brief.css'
export function SupplementSessionDetails({suggestion}:{suggestion:GoalSupplementSuggestion}){
 if(!suggestion.segments?.length)return null
 return <div className="cdb-supplement-session" aria-label="Laufband Trainingsablauf">
  {suggestion.segments.map((s,i)=><div key={i}><b>{s.minutes} Min.</b><span><strong>{s.label}</strong><small>{s.incline.toLocaleString('de-DE')} % · {s.intensity}</small></span></div>)}
  {suggestion.note&&<small>{suggestion.note}</small>}
  <small>Vorwärts trainieren. Bei Unsicherheit flach gehen, bei Schmerzen oder Schwindel abbrechen.</small>
 </div>
}

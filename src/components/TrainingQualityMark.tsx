import type {QualityIntent} from '../lib/trainingIntent.mjs'
import {qualityPresentation} from '../lib/trainingIntent.mjs'
import {Icon} from './Icon'
import '../styles/training-quality.css'

export function TrainingQualityMark({intent,blocked=false,compact=false,today=false}:{intent:QualityIntent|null|undefined;blocked?:boolean;compact?:boolean;today?:boolean}){
 const q=qualityPresentation(intent)
 if(!q)return null
 const label=blocked?'Qualität geplant · Coach rät ab':q.label
 const text=blocked?'Der gespeicherte Termin bleibt erhalten. Erholung hat Vorrang; keine intensive Einheit erzwingen.':q.description
 return <span className={'tq-mark tq-'+(blocked?'blocked':intent)+(compact?' tq-compact':'')}>
  <span className="tq-label"><Icon name="zap"/><strong>{today?'Heute · ':''}{label}</strong></span>
  {!compact&&<small>{text}</small>}
 </span>
}

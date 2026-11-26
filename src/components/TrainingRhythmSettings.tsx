import {useState} from 'react'
import {readRhythm,saveRhythm} from '../lib/trainingRhythm.mjs'
import type {TrainingRhythm} from '../lib/trainingRhythm.mjs'
import {Icon} from './Icon'
import '../styles/training-rhythm.css'
const weekdays=['Mo','Di','Mi','Do','Fr','Sa','So']
const types=[{key:'rowing',title:'Rudern',icon:'waves'},{key:'strength',title:'Stabi & Mobility',icon:'activity'}] as const
export function TrainingRhythmSettings({onSaved}:{onSaved:()=>void}){
 const [draft,setDraft]=useState<TrainingRhythm>(readRhythm)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 return <details className="tr-settings">
  <summary><Icon name="calendar-days"/><span><strong>Mein Trainingsrhythmus</strong><small>Feste Wunschtage für Rudern und Stabi</small></span><Icon name="chevron-down"/></summary>
  <div className="tr-body">
   {types.map(({key,title,icon})=><fieldset key={key}>
    <legend><Icon name={icon}/> {title}</legend>
    <div className="tr-days" role="group" aria-label={title+' Wochentage'}>{weekdays.map((d,i)=><button key={d} type="button" aria-pressed={draft[key].days.includes(i+1)} onClick={()=>{setNotice('');setDraft(old=>({...old,[key]:{...old[key],days:old[key].days.includes(i+1)?old[key].days.filter(n=>n!==i+1):[...old[key].days,i+1]}}))}}>{d}</button>)}</div>
    <label>Gewünschte Dauer <select value={draft[key].minutes} onChange={e=>{setNotice('');setDraft(old=>({...old,[key]:{...old[key],minutes:Number(e.target.value)}}))}}>{[15,20,30,45,60].map(n=><option key={n} value={n}>{n} Min.</option>)}</select></label>
   </fieldset>)}
   <p>Wunschtage sind keine Pflichttermine. Coach, Erholung und bestehende Einheiten haben Vorrang; bei Bedarf verkürzen, ersetzen oder pausieren. Speicherung in diesem Browser.</p>
   <button type="button" className="tr-save" onClick={()=>{try{const value=saveRhythm(draft);setDraft(value);setError('');setNotice('Trainingsrhythmus gespeichert.');window.dispatchEvent(new Event('garmin-ai-coach-changed'));onSaved()}catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}}}>Trainingsrhythmus speichern</button>
   {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </div>
 </details>
}

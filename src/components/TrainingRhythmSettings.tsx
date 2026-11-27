import {useEffect,useState} from 'react'
import {DEFAULT_RHYTHM} from '../lib/trainingRhythm.mjs'
import {loadTrainingRhythm,saveTrainingRhythm} from '../lib/trainingHistoryApi'
import type {TrainingRhythm} from '../lib/trainingRhythm.mjs'
import {Icon} from './Icon'
import '../styles/training-rhythm.css'
const weekdays=['Mo','Di','Mi','Do','Fr','Sa','So']
const types=[{key:'rowing',title:'Rudern',icon:'waves'},{key:'strength',title:'Stabi & Mobility',icon:'activity'}] as const
export function TrainingRhythmSettings({active,onSaved,expanded=false}:{active:boolean;onSaved:()=>void;expanded?:boolean}){
 const [draft,setDraft]=useState<TrainingRhythm>(DEFAULT_RHYTHM)
 const [ready,setReady]=useState(false)
 const [busy,setBusy]=useState(false)
 const [retry,setRetry]=useState(0)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!active)return
  const controller=new AbortController()
  setReady(false);setError('');setNotice('')
  void loadTrainingRhythm(controller.signal).then(value=>{if(!controller.signal.aborted){setDraft(value);setReady(true)}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Trainingsrhythmus nicht verfügbar.')})
  return ()=>controller.abort()
 },[active,retry])
 if(!active)return null
 async function save(){
  if(!ready||busy)return
  setBusy(true);setNotice('');setError('')
  try{const value=await saveTrainingRhythm(draft);setDraft(value);setNotice('Trainingsrhythmus gespeichert.');window.dispatchEvent(new Event('garmin-ai-coach-changed'));onSaved()}
  catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}
  finally{setBusy(false)}
 }
 return <details className="tr-settings" open={expanded||undefined}>
  <summary><Icon name="calendar-days"/><span><strong>Mein Trainingsrhythmus</strong><small>Feste Wunschtage für Rudern und Stabi</small></span><Icon name="chevron-down"/></summary>
  <div className="tr-body">
   {types.map(({key,title,icon})=><fieldset key={key} disabled={!ready||busy}>
    <legend><Icon name={icon}/> {title}</legend>
    <div className="tr-days" role="group" aria-label={title+' Wochentage'}>{weekdays.map((d,i)=><button key={d} type="button" aria-pressed={draft[key].days.includes(i+1)} onClick={()=>{setNotice('');setDraft(old=>({...old,[key]:{...old[key],days:old[key].days.includes(i+1)?old[key].days.filter(n=>n!==i+1):[...old[key].days,i+1]}}))}}>{d}</button>)}</div>
    <label>Gewünschte Dauer <select value={draft[key].minutes} onChange={e=>{setNotice('');setDraft(old=>({...old,[key]:{...old[key],minutes:Number(e.target.value)}}))}}>{[15,20,30,45,60].map(n=><option key={n} value={n}>{n} Min.</option>)}</select></label>
   </fieldset>)}
   <p>Wunschtage sind keine Pflichttermine. Coach, Erholung und bestehende Einheiten haben Vorrang; bei Bedarf verkürzen, ersetzen oder pausieren. Geräteübergreifend in deinem privaten Trainingsprofil gespeichert.</p>
   {!ready&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Profil erneut laden</button>}
   <button type="button" className="tr-save" disabled={!ready||busy} onClick={()=>void save()}>{busy?'Speichere …':'Trainingsrhythmus speichern'}</button>
   {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </div>
 </details>
}

import {useEffect,useState} from 'react'
import type {PlanSnapshot,HistoryRevision} from '../lib/trainingHistory.mjs'
import {saveTrainingWeek} from '../lib/trainingHistoryApi'
import {Icon} from './Icon'
import '../styles/training-history.css'

const stable=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
const requests=new Map<string,Promise<HistoryRevision>>()
function archive(snapshot:PlanSnapshot,key:string){
 const existing=requests.get(key)
 if(existing)return existing
 const request=saveTrainingWeek(snapshot,crypto.randomUUID()).finally(()=>{requests.delete(key)})
 requests.set(key,request)
 return request
}
/** Archive only current-week evidence. Server deduplicates identical revisions
 * and preserves elapsed days. Never approves or publishes a workout. */
export function TrainingWeekArchive({active,snapshot,onHistory,compact=false}:{active:boolean;snapshot:PlanSnapshot;onHistory:()=>void;compact?:boolean}){
 const [revision,setRevision]=useState<HistoryRevision|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [retry,setRetry]=useState(0)
 const key=stable(snapshot)
 useEffect(()=>{
  if(!active)return
  let current=true
  setBusy(true);setError('')
  // Use a canonical copy, not a mutable reference from the rendering screen.
  const timer=window.setTimeout(()=>{
   void archive(JSON.parse(key) as PlanSnapshot,key).then(result=>{
    if(current){setRevision(result);window.dispatchEvent(new Event('garmin-ai-training-history-changed'))}
   }).catch(e=>{if(current)setError(e instanceof Error?e.message:'Archivierung fehlgeschlagen.')}).finally(()=>{if(current)setBusy(false)})
  },350)
  return ()=>{current=false;window.clearTimeout(timer)}
 },[active,key,retry])
 if(!active)return null
 if(compact&&!error)return null
 return <div className="th-archive">
  <span className="th-icon"><Icon name="calendar-days"/></span>
  <div className="th-archive-copy"><strong>Wochenarchiv</strong>
   <small>{error?'Archivierung nicht bestätigt':busy?'Aktueller Wochenstand wird gespeichert …':revision?'Wochenstand gespeichert · frühere Planversionen bleiben erhalten':'Noch keine Speicherbestätigung'}</small>
   <small>{revision?.snapshot.partial?'Erster Stand unter der Woche erfasst. Frühere Vorschläge werden nicht erfunden. ':''}Automatisch beim Laden von Coach oder Kalender. Keine Trainingsfreigabe.</small>
   {error&&<small role="alert">{error}</small>}
  </div>
  <div className="th-archive-actions">{error&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Erneut versuchen</button>}<button type="button" className="th-secondary" onClick={onHistory}>Trainingshistorie</button></div>
 </div>
}

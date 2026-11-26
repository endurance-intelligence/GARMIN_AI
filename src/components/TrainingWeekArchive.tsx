import {useEffect,useRef,useState} from 'react'
import type {PlanSnapshot,HistoryRevision} from '../lib/trainingHistory.mjs'
import {readTrainingMonth,saveTrainingWeek} from '../lib/trainingHistoryApi'
import {Icon} from './Icon'
import '../styles/training-history.css'
const stable=(value:unknown):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
export function TrainingWeekArchive({active,snapshot,onHistory}:{active:boolean;snapshot:PlanSnapshot;onHistory:()=>void}){
 const [revisions,setRevisions]=useState<HistoryRevision[]|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const request=useRef<{key:string;id:string}|null>(null)
 const lock=useRef(false)
 const week=snapshot.weekStart
 useEffect(()=>{
  if(!active)return
  const controller=new AbortController()
  setRevisions(null);setError('');setNotice('')
  void readTrainingMonth(week.slice(0,7),controller.signal).then(data=>{if(!controller.signal.aborted)setRevisions(data.revisions.filter(r=>r.week_start===week))}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Archiv nicht erreichbar.')})
  return ()=>controller.abort()
 },[active,week])
 const latest=revisions?.at(-1)
 const unchanged=latest&&stable(latest.snapshot)===stable(snapshot)
 const save=async()=>{
  if(lock.current||!revisions||unchanged)return
  lock.current=true;setBusy(true);setError('');setNotice('')
  const key=stable(snapshot)
  if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
  try{
   const result=await saveTrainingWeek(snapshot,request.current!.id)
   setRevisions(old=>[...(old||[]).filter(r=>r.id!==result.id),result])
   setNotice('Wochenplan dauerhaft gespeichert.')
   window.dispatchEvent(new Event('garmin-ai-training-history-changed'))
  }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}
  finally{lock.current=false;setBusy(false)}
 }
 return <div className="th-archive">
  <span className="th-icon"><Icon name="calendar-days"/></span>
  <div className="th-archive-copy"><strong>Wochenplan festhalten</strong><small>{revisions===null?'Archivstatus wird geprüft':revisions.length?revisions.length+' gespeicherte Planversion(en) · ursprünglicher Stand bleibt erhalten':'Noch kein gespeicherter Wochenplan'}</small>
   <small>{snapshot.entries.length} geplante Einheiten im sichtbaren Planstand. {snapshot.partial?'Unter der Woche erfasst: fehlende frühere Planungen werden nicht rekonstruiert. ':''}Vorschläge bleiben freigabepflichtig.</small>
   {notice&&<small role="status">{notice}</small>}{error&&<small role="alert">{error}</small>}
  </div>
  <div className="th-archive-actions"><button type="button" disabled={busy||revisions===null||!!unchanged} onClick={()=>void save()}>{busy?'Speichere …':unchanged?'Stand gespeichert':revisions?.length?'Anpassung speichern':'Wochenplan speichern'}</button><button type="button" className="th-secondary" onClick={onHistory}>Trainingshistorie</button></div>
 </div>
}

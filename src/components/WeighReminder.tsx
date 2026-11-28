import {useEffect,useState} from 'react'
import {healthPreferencesRequest} from '../lib/healthPreferencesApi'
export function WeighReminder({active,today,onWeigh}:{active:boolean;today:string;onWeigh:()=>void}){
 const [due,setDue]=useState(false),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>{const changed=()=>{setDue(false);setRevision(n=>n+1)};window.addEventListener('garmin-ai-health-preferences-changed',changed);window.addEventListener('garmin-ai-weight-saved',changed);return()=>{window.removeEventListener('garmin-ai-health-preferences-changed',changed);window.removeEventListener('garmin-ai-weight-saved',changed)}},[])
 useEffect(()=>{if(!active)return;const c=new AbortController();setDue(false);void healthPreferencesRequest(undefined,c.signal).then(d=>{if(!c.signal.aborted)setDue(d.date===today&&d.reminderDue===true)}).catch(()=>{if(!c.signal.aborted)setDue(false)});return()=>c.abort()},[active,today,revision])
 async function dismiss(){if(busy)return;setBusy(true);try{const d=await healthPreferencesRequest({action:'dismiss_weigh'});if(d.date===today&&d.reminderDue===false)setDue(false)}catch{/* A failed persistence must not claim success. */}finally{setBusy(false)}}
 if(!active||!due)return null
 return <aside className="co-saved-note" aria-label="Freiwillige Wiege-Erinnerung"><p>Wenn du möchtest: Heute wäre ein Wiegetag. Einzelne Schwankungen sind normal.</p><button type="button" className="secondary" onClick={onWeigh}>Gewicht eintragen</button> <button type="button" className="secondary" disabled={busy} onClick={()=>void dismiss()}>Heute auslassen</button></aside>
}

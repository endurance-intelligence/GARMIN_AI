import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/race-goal-portfolio.css'
type Race={id?:string;race_name:string;race_date:string;distance_km:number;
 target_hours:number|null;race_location:string;race_start_time:string|null;coach_note:string}
const fresh={race_name:'',race_date:'',distance_km:10,target_hours:null,
 race_location:'',race_start_time:null,coach_note:''} as Race
async function call(action?:Record<string,unknown>){
 if(!garminSupabase)throw Error('Bitte anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden.')
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-race-goals',{
  method:action?'POST':'GET',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
   ...(action?{'content-type':'application/json'}:{})},
  ...(action?{body:JSON.stringify({...action,confirm:true})}:{}),cache:'no-store'
 })
 const data=await response.json().catch(()=>({})) as Record<string,unknown>
 if(!response.ok)throw Error(String(data.error||'Ziele nicht verfügbar'))
 return data
}
export function RaceGoalsPanel({active,onPrimaryChange}:{active:boolean;onPrimaryChange:()=>void}){
 const [main,setMain]=useState<Race|null>(null)
 const [others,setOthers]=useState<Race[]>([])
 const [draft,setDraft]=useState<Race>(fresh)
 const [editing,setEditing]=useState(false)
 const [busy,setBusy]=useState(false)
 const [confirm,setConfirm]=useState<string|null>(null)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 async function refresh(){
  const data=await call()
  setMain(data.primary as Race|null)
  setOthers(Array.isArray(data.others)?data.others as Race[]:[])
 }
 useEffect(()=>{
  if(!active)return
  let live=true
  void call().then(data=>{if(live){setMain(data.primary as Race|null)
   setOthers(Array.isArray(data.others)?data.others as Race[]:[])}})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:'Ziele nicht abrufbar')})
  return ()=>{live=false}
 },[active])
 async function action(data:Record<string,unknown>){
  setBusy(true);setError('');setNotice('')
  try{
   const result=await call(data)
   if(!result.saved&&!result.promoted&&!result.removed)throw Error('Keine Speicherung bestätigt.')
   await refresh()
   if(data.action==='promote'){onPrimaryChange();setNotice('Das Hauptziel wurde gewechselt. Das bisherige Hauptziel bleibt als weiteres Ziel erhalten.')}
   else setNotice(data.action==='add'?'Weiteres Ziel gespeichert. Der Coach arbeitet weiterhin auf dein Hauptziel hin.':'Zusätzliches Ziel entfernt.')
   setEditing(false);setConfirm(null)
   if(data.action==='add')setDraft(fresh)
  }catch(e){setError(e instanceof Error?e.message:'Änderung fehlgeschlagen.')}
  finally{setBusy(false)}
 }
 if(!active)return null
 return <section className="rgp-root" aria-label="Weitere Wettkampfziele">
  <div className="rgp-head"><div><small>RACE PREP / ZIELPORTFOLIO</small>
   <h2>Ein Hauptziel. Weitere Rennen.</h2>
   <p>Der Coach richtet die Trainingsphasen nach deinem Hauptziel aus. Andere Rennen sind Testläufe oder zusätzliche Ziele.</p></div>
   <button type="button" onClick={()=>setEditing(x=>!x)}>{editing?'Schließen':'+ Weiteres Ziel'}</button>
  </div>
  {main&&<div className="rgp-main"><span>HAUPTZIEL · STEUERT DEN COACH</span>
   <strong>{main.race_name}</strong><small>{main.race_date.split('-').reverse().join('.')} · {main.distance_km} km</small>
  </div>}
  {others.length>0&&<div className="rgp-items">
   {others.map(x=><div className="rgp-item" key={x.id}>
    <div><strong>{x.race_name}</strong><span>{x.race_date.split('-').reverse().join('.')} · {x.distance_km} km · {x.race_location||'Ort offen'}</span></div>
    <div className="rgp-actions">
     {confirm===x.id+'-promote'?<>
      <button type="button" disabled={busy} onClick={()=>void action({action:'promote',id:x.id})}>Als Hauptziel bestätigen</button>
      <button type="button" onClick={()=>setConfirm(null)}>Abbrechen</button>
     </>:confirm===x.id+'-remove'?<>
      <button type="button" disabled={busy} onClick={()=>void action({action:'remove',id:x.id})}>Entfernen bestätigen</button>
      <button type="button" onClick={()=>setConfirm(null)}>Abbrechen</button>
     </>:<>
      <button type="button" disabled={busy} onClick={()=>setConfirm(x.id+'-promote')}>Zum Hauptziel machen</button>
      <button type="button" disabled={busy} onClick={()=>setConfirm(x.id+'-remove')}>Entfernen</button>
     </>}
    </div>
   </div>)}
  </div>}
  {editing&&<div className="rgp-form">
   <div><label>Wettkampf<input value={draft.race_name} maxLength={100}
    onChange={e=>setDraft(x=>({...x,race_name:e.target.value}))}/></label>
    <label>Datum<input type="date" value={draft.race_date}
     onChange={e=>setDraft(x=>({...x,race_date:e.target.value}))}/></label>
    <label>Distanz in km<input type="number" min="0.1" max="500" step="0.1" value={draft.distance_km}
     onChange={e=>setDraft(x=>({...x,distance_km:Number(e.target.value)}))}/></label>
    <label>Zielzeit in h (optional)<input type="number" min="0.1" max="100" step="0.25" value={draft.target_hours??''}
     onChange={e=>setDraft(x=>({...x,target_hours:e.target.value===''?null:Number(e.target.value)}))}/></label>
    <label>Ort<input value={draft.race_location} maxLength={120}
     onChange={e=>setDraft(x=>({...x,race_location:e.target.value}))}/></label>
    <label>Startzeit (optional)<input type="time" value={draft.race_start_time||''}
     onChange={e=>setDraft(x=>({...x,race_start_time:e.target.value||null}))}/></label>
    <label className="rgp-note">Hinweis für den Coach<textarea rows={2} maxLength={600} value={draft.coach_note}
     onChange={e=>setDraft(x=>({...x,coach_note:e.target.value}))}/></label>
   </div>
   <button type="button" disabled={busy||!draft.race_name||!draft.race_date} onClick={()=>void action({
    action:'add',raceName:draft.race_name,raceDate:draft.race_date,distanceKm:draft.distance_km,
    targetHours:draft.target_hours,raceLocation:draft.race_location,raceStartTime:draft.race_start_time,coachNote:draft.coach_note
   })}>{busy?'Speichere …':'Als weiteres Ziel speichern'}</button>
  </div>}
  {notice&&<p className="rgp-ok" role="status">{notice}</p>}
  {error&&<p className="rgp-error" role="alert">{error}</p>}
 </section>
}

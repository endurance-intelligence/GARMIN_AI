import {useEffect,useState} from 'react'
import {berlinDateToday} from '../lib/coachGoal'
import {Icon} from './Icon'
import {GoalLogoEditor} from './GoalLogoEditor'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/race-goal-portfolio.css'
type Race={id?:string;race_name:string;race_date:string;distance_km:number;
 target_hours:number|null;race_location:string;race_start_time:string|null;coach_note:string;goal_logo?:string|null}
const fresh={race_name:'',race_date:'',distance_km:10,target_hours:null,
 race_location:'',race_start_time:null,coach_note:''} as Race
async function call(action?:Record<string,unknown>){
 if(!garminSupabase)throw Error('Bitte anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden.')
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-race-goals?includeLogo=1',{
  method:action?'POST':'GET',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
   ...(action?{'content-type':'application/json'}:{})},
  ...(action?{body:JSON.stringify({...action,confirm:true})}:{}),cache:'no-store'
 })
 const data=await response.json().catch(()=>({})) as Record<string,unknown>
 if(!response.ok)throw Error(String(data.error||'Ziele nicht verfügbar'))
 return data
}
export function RaceGoalsPanel({active,onPrimaryChange,onPortfolioChange}:{active:boolean;onPrimaryChange:()=>void;onPortfolioChange?:()=>void}){
 const [others,setOthers]=useState<Race[]>([])
 const [draft,setDraft]=useState<Race>(fresh)
 const [editing,setEditing]=useState(false)
 const [editId,setEditId]=useState<string|null>(null)
 const [logoDraft,setLogoDraft]=useState<string|undefined>(undefined)
 const [logoPreparing,setLogoPreparing]=useState(false)
 const today=berlinDateToday()
 const [busy,setBusy]=useState(false)
 const [confirm,setConfirm]=useState<string|null>(null)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [loading,setLoading]=useState(true)
 useEffect(()=>{
  if(!active)return
  const start=()=>{setDraft({...fresh});setLogoDraft(undefined);setEditId(null);setEditing(true);setConfirm(null)}
  window.addEventListener('garmin-ai-add-race-goal',start)
  return ()=>window.removeEventListener('garmin-ai-add-race-goal',start)
 },[active])
 async function refresh(){
  const data=await call()
  setOthers(Array.isArray(data.others)?data.others as Race[]:[])
 }
 useEffect(()=>{
  if(!active)return
  let live=true;setLoading(true);setError('')
  void call().then(data=>{if(live){setOthers(Array.isArray(data.others)?data.others as Race[]:[])}})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:'Ziele nicht abrufbar')}).finally(()=>{if(live)setLoading(false)})
  return ()=>{live=false}
 },[active])
 async function action(data:Record<string,unknown>){
  if(busy||logoPreparing)return
  setBusy(true);setError('');setNotice('')
  try{
   const result=await call(data)
   if(!result.saved&&!result.promoted&&!result.removed)throw Error('Keine Speicherung bestätigt.')
   await refresh()
   if(data.action==='promote'){onPrimaryChange();setNotice('Das Hauptziel wurde gewechselt. Das bisherige Hauptziel bleibt als weiteres Ziel erhalten.')}
   else setNotice(data.action==='add'?'Weiteres Ziel gespeichert. Wähle es als Hauptziel, wenn der Coach darauf ausgerichtet werden soll.':data.action==='update'?'Änderungen am Ziel gespeichert.':'Zusätzliches Ziel entfernt.')
   if(data.action!=='promote'){onPortfolioChange?.();window.dispatchEvent(new Event('garmin-ai-coach-changed'))}
   setEditing(false);setConfirm(null);setEditId(null);setLogoDraft(undefined);setDraft({...fresh})
  }catch(e){setError(e instanceof Error?e.message:'Änderung fehlgeschlagen.')}
  finally{setBusy(false)}
 }
 const upcoming=others.filter(x=>x.race_date>=today).sort((a,b)=>a.race_date.localeCompare(b.race_date))
 const past=others.filter(x=>x.race_date<today).sort((a,b)=>b.race_date.localeCompare(a.race_date))
 const renderRace=(x:Race)=><div className="rgp-item" key={x.id}>
    <div className="rgp-goal-heading"><span className="rgp-date-tile"><strong>{x.race_date.slice(8,10)}</strong><small>{new Date(x.race_date+'T12:00:00Z').toLocaleDateString('de-DE',{month:'short',timeZone:'UTC'})}</small></span>{x.goal_logo&&<img className="rgp-goal-logo" src={x.goal_logo} alt=""/>}<div><strong>{x.race_name}</strong><span>{x.race_date.slice(0,4)} · {x.distance_km} km{ x.target_hours!==null?' · Ziel '+x.target_hours+' h':''} · {x.race_location||'Ort offen'}</span></div></div>
    <div className="rgp-actions">
     {confirm===x.id+'-promote'?<>
      <button type="button" disabled={busy} onClick={()=>void action({action:'promote',id:x.id})}>Als Hauptziel bestätigen</button>
      <button type="button" onClick={()=>setConfirm(null)}>Abbrechen</button>
     </>:confirm===x.id+'-remove'?<>
      <button type="button" disabled={busy} onClick={()=>void action({action:'remove',id:x.id})}>Entfernen bestätigen</button>
      <button type="button" onClick={()=>setConfirm(null)}>Abbrechen</button>
     </>:<>
      {x.race_date>=today&&<button type="button" disabled={busy} onClick={()=>setConfirm(x.id+'-promote')}>Zum Hauptziel machen</button>}
      <button type="button" disabled={busy||logoPreparing} onClick={()=>{setDraft({...x,race_start_time:x.race_start_time?.slice(0,5)||null});setLogoDraft(undefined);setEditId(x.id||null);setEditing(true);setConfirm(null)}}>Bearbeiten</button>
      <button type="button" disabled={busy} onClick={()=>setConfirm(x.id+'-remove')}>Entfernen</button>
     </>}
    </div>
   </div>
 if(!active)return null
 return <section className="rgp-root" id="race-goal-portfolio" aria-label="Weitere Wettkampfziele">
  <div className="rgp-head"><div><small>DEIN ZIELPORTFOLIO</small>
   <h2>Weitere Ziele &amp; Events</h2>
   <p>Ein Hauptziel steuert den Coach. Weitere Events bleiben im Kalender.</p></div>
   <button type="button" disabled={busy||logoPreparing} onClick={()=>{setEditing(x=>!x);setEditId(null);setLogoDraft(undefined);setDraft({...fresh});setConfirm(null)}}>{editing?<><Icon name="x"/> Abbrechen</>:'+ Weiteres Ziel'}</button>
  </div>
  <p className="rgp-focus-count">{others.filter(x=>x.race_date>=today).length} kommende · {others.filter(x=>x.race_date<today).length} vergangene</p>
  {loading?<p className="rgp-focus-count" role="status">Ziele werden geladen …</p>:!error&&upcoming.length===0&&<p className="rgp-empty">Keine weiteren kommenden Ziele. Über „+ Weiteres Ziel“ kannst du ein Event oder eine Challenge ergänzen.</p>}
  {upcoming.length>0&&<div className="rgp-items rgp-upcoming">{upcoming.map(renderRace)}</div>}
  {past.length>0&&<details className="rgp-focus-list"><summary>Vergangene Ziele · {past.length}</summary><div className="rgp-items">{past.map(renderRace)}</div></details>}
  {editing&&<div className="rgp-form">
   <strong>{editId?'Ziel bearbeiten':'Neues Wettkampfziel'}</strong>
   <GoalLogoEditor value={logoDraft===undefined?draft.goal_logo:logoDraft} onChange={setLogoDraft} disabled={busy} onPreparing={setLogoPreparing}/>
   <div><label>Zielname<input value={draft.race_name} maxLength={100}
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
   <button type="button" disabled={busy||logoPreparing||!draft.race_name||!draft.race_date} onClick={()=>void action({
    action:editId?'update':'add',...(editId?{id:editId}:{}),raceName:draft.race_name,raceDate:draft.race_date,distanceKm:draft.distance_km,
    targetHours:draft.target_hours,raceLocation:draft.race_location,raceStartTime:draft.race_start_time,coachNote:draft.coach_note,
    ...(logoDraft===undefined?{}:{logoData:logoDraft})
   })}>{busy?'Speichere …':editId?'Änderungen speichern':'Als weiteres Ziel speichern'}</button>
  </div>}
  {notice&&<p className="rgp-ok" role="status">{notice}</p>}
  {error&&<p className="rgp-error" role="alert">{error}</p>}
 </section>
}

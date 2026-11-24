import {useEffect,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import {phaseForRace,berlinDateToday,suggestedGoal} from '../lib/coachGoal'
import {getTrainingGoalMode} from '../lib/trainingGoalMode.mjs'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/coach-goal.css'
import {CoachRaceWeatherMini} from './CoachRaceWeatherMini'
import {Icon} from './Icon'

async function goalRequest(body?:Record<string,unknown>):Promise<{goal:CoachGoal|null;saved?:boolean}>{
 if(!garminSupabase)throw Error('Bitte zuerst anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte zuerst anmelden.')
 const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-goal',{
  method:body?'POST':'GET',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 })
 const result=await res.json().catch(()=>({})) as {goal:CoachGoal|null;saved?:boolean;error?:string}
 if(!res.ok)throw Error(result.error||'Ziel nicht erreichbar ('+res.status+')')
 return result
}
type Draft={raceName:string;raceDate:string;distanceKm:string;targetHours:string;raceLocation:string;raceStartTime:string;coachNote:string}
const asDraft=(x:Omit<CoachGoal,'updated_at'>):Draft=>({
 raceName:x.race_name,raceDate:x.race_date,distanceKm:String(x.distance_km),
 targetHours:x.target_hours===null?'':String(x.target_hours),
 raceLocation:x.race_location,raceStartTime:(x.race_start_time||'').slice(0,5),
 coachNote:x.coach_note
})
export function CoachGoalPanel({active,compact=false,onEdit,onSaved,logoUrl,onForecastOpen}:{active:boolean;compact?:boolean;onEdit?:()=>void;onSaved?:()=>void;logoUrl?:string|null;onForecastOpen?:()=>void}){
 const [goal,setGoal]=useState<CoachGoal|null>(null)
 const [draft,setDraft]=useState<Draft>(()=>({raceName:'',raceDate:'',distanceKm:'',targetHours:'',raceLocation:'',raceStartTime:'',coachNote:''}))
 const [editOpen,setEditOpen]=useState(false)
 const [maintainOpen,setMaintainOpen]=useState(false)
 const [maintainKm,setMaintainKm]=useState('')
 const [loading,setLoading]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [ready,setReady]=useState(false)
 const [savedLogo,setSavedLogo]=useState<string|null>(null)
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setLoading(true);setError('')
  void goalRequest().then(result=>{
   if(!mounted)return
   setGoal(result.goal)
   if(result.goal){setDraft(asDraft(result.goal));setMaintainKm(result.goal.maintenance_weekly_km==null?'':String(result.goal.maintenance_weekly_km))}
   setReady(true)
  }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Ziel nicht abrufbar')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active])
 useEffect(()=>{
  if(!active||!goal||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setSavedLogo(null)
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)return
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-race-research',{
    method:'GET',cache:'no-store',signal:controller.signal,
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   })
   if(!response.ok)return
   const data=await response.json() as {saved?:Array<{race_date:string;details?:{logoUrl?:unknown}}>}
   const match=data.saved?.find(x=>x.race_date===goal.race_date)
   const value=match?.details?.logoUrl
   if(mounted)setSavedLogo(typeof value==='string'&&/^https:\/\//i.test(value)?value:null)
  })().catch(()=>{if(mounted)setSavedLogo(null)})
  return ()=>{mounted=false;controller.abort()}
 },[active,goal?.race_date,goal?.race_name])
 async function save(){
  if(saving)return
  setError('');setNotice('');setSaving(true)
  try{
   if(!draft.raceName.trim()||!draft.raceDate||!draft.distanceKm)throw Error('Bitte Wettkampf, Datum und Distanz eintragen.')
   const distance=Number(draft.distanceKm),hours=draft.targetHours?Number(draft.targetHours):null
   if(!Number.isFinite(distance)||distance<1||distance>500||hours!==null&&(!Number.isFinite(hours)||hours<=0||hours>100))
    throw Error('Distanz oder Zielzeit ungültig.')
   const response=await goalRequest({action:'save',confirm:true,
    raceName:draft.raceName.trim(),raceDate:draft.raceDate,
    distanceKm:distance,targetHours:hours,raceLocation:draft.raceLocation.trim(),
    raceStartTime:draft.raceStartTime||null,coachNote:draft.coachNote.trim()
   })
   if(!response.saved||!response.goal)throw Error('Speicherung nicht bestätigt.')
   setGoal(response.goal)
   setDraft(asDraft(response.goal))
   setNotice('Dein aktives Wettkampfziel ist gespeichert. Garmin-Workouts bleiben unverändert.')
   setEditOpen(false)
   onSaved?.()
  }catch(e){setError(e instanceof Error?e.message:'Ziel konnte nicht gespeichert werden.')}
  finally{setSaving(false)}
 }
 async function saveMaintenance(){
  if(saving||!goal)return
  const km=Number(maintainKm)
  if(!Number.isFinite(km)||km<1||km>200){setError('Bitte gewünschten Wochenumfang zwischen 1 und 200 km eingeben.');return}
  setSaving(true);setError('');setNotice('')
  try{
   const response=await goalRequest({action:'maintenance',confirm:true,weeklyKm:km,expectedRaceDate:goal.race_date,expectedRaceName:goal.race_name})
   if(!response.saved||!response.goal)throw Error('Speicherung nicht bestätigt.')
   setGoal(response.goal);setMaintainOpen(false);setNotice('Fit halten: '+km+' km/Woche als Richtwert gespeichert. Erholung hat Vorrang.');onSaved?.()
  }catch(e){setError(e instanceof Error?e.message:'Trainingsniveau nicht gespeichert.')}
  finally{setSaving(false)}
 }
 if(!active)return null
 if(!ready)return <section className="cg-root" aria-label="Trainingsziel"><p className="cg-info">{error||'Lade dein Trainingsziel …'}</p></section>
 const current=goal||suggestedGoal
 const phase=phaseForRace(current.race_date,berlinDateToday())
 const goalIsPast=Boolean(goal&&phase.daysUntil<0)
 const trainingMode=getTrainingGoalMode(goal,berlinDateToday())
 const maintaining=trainingMode.mode==='maintenance'
 const chooseNew=()=>{const el=document.getElementById('race-goal-portfolio');el?.scrollIntoView({behavior:'smooth',block:'start'});window.dispatchEvent(new Event('garmin-ai-add-race-goal'))}
 const distanceText=Number(current.distance_km).toLocaleString('de-DE',{maximumFractionDigits:1})
 const days=Math.max(0,phase.daysUntil)
 const eventLogo=logoUrl&&/^https:\/\//i.test(logoUrl)?logoUrl:savedLogo
 const goalBadge=<span className="cg-goal-emblem" aria-label={'Rennlogo '+current.race_name}>
  {eventLogo?<img src={eventLogo} alt={'Logo '+current.race_name}
   loading="lazy" referrerPolicy="no-referrer"
   onError={()=>setSavedLogo(null)}/>:
   <span className="cg-goal-emblem-fallback" aria-hidden="true"><Icon name="flag"/></span>}
 </span>
 if(compact&&(!goal||goalIsPast))return <section className="cg-root cg-compact cg-home-hero cg-past-goal" aria-label="Trainingsauftrag">
  <span className="cg-kicker">{maintaining?'FIT HALTEN':'NEUES ZIEL VERFOLGEN'}</span>
  <h2>{maintaining?trainingMode.weeklyKm+' km/Woche als Richtwert':'Wie geht es weiter?'}</h2>
  <p>{goal?'Letzter Wettkampf: '+goal.race_name+'. ':''}{goalIsPast&&phase.phase==='recovery'?'Regeneration bleibt unabhängig vom neuen Ziel wichtig. ':''} {maintaining?'Trainingsniveau beibehalten, nicht automatisch steigern.':'Neues Wettkampfziel auswählen oder Trainingsniveau halten.'}</p>
  <button type="button" className="cg-home-edit" onClick={onEdit} disabled={!onEdit}>{maintaining?'Trainingsauftrag ändern ↗':'Neues Ziel / fit halten ↗'}</button>
 </section>
 if(compact)return <section className={'cg-root cg-compact cg-home-hero'+(goalIsPast?' cg-past-goal':'')}
  aria-label={goalIsPast?'Letzter Wettkampf und Auswahl des nächsten Ziels':'Aktuelles Hauptziel und Rennwetter'}>
  <div className="cg-home-race">
   <div className="cg-home-race-head"><span className="cg-kicker">{goalIsPast?'LETZTER WETTKAMPF · NÄCHSTES ZIEL WÄHLEN':'DEIN NÄCHSTES ZIEL'}</span></div>
   <div className="cg-home-race-main">
    <div className="cg-home-race-info">
     <div className="cg-goal-name">{goalBadge}<h2>{current.race_name}</h2></div>
     <div className="cg-home-race-meta">
      <span>{current.race_date.split('-').reverse().join('.')}</span>
      <span>{distanceText} km</span>
      {current.target_hours!==null&&<span>Ziel {Number(current.target_hours).toLocaleString('de-DE')} h</span>}
      <span>{phase.title}</span>
     </div>
     <button className="cg-home-edit" type="button" onClick={onEdit}
      disabled={!onEdit}>{goalIsPast?'Nächstes Ziel festlegen ↗':'Ziel bearbeiten ↗'}</button>
    </div>
    {!goalIsPast&&<div className="cg-home-days"><strong>{phase.daysUntil>0?days:phase.daysUntil===0?'GO':'–'}</strong>
     <small>{phase.daysUntil>0?'TAGE BIS START':phase.daysUntil===0?'HEUTE':'ZIEL VORBEI'}</small></div>}
   </div>
  </div>
  {!goalIsPast&&<CoachRaceWeatherMini active={active} goal={current} onOpenDetails={onForecastOpen}/>} 
  {loading&&<small className="cg-home-loading">Aktives Ziel wird aktualisiert …</small>}
  {error&&<small className="cg-home-error" role="alert">{error}</small>}
 </section>
 return <section className={'cg-root'+(compact?' cg-compact':'')} aria-label="Trainingsziel und Vorbereitungsphase">
  <div className="cg-head">
   <span className="cg-kicker">COACH / MEIN ZIEL</span>
   <span className={'cg-state'+(goal?' is-active':'')}>{goalIsPast?'VERGANGENER WETTKAMPF':goal?'AKTIVES ZIEL':'NEUES ZIEL · NOCH NICHT GESPEICHERT'}</span>
  </div>
  {goal&&<div className="cg-summary">
   <div><div className="cg-title-row">{goalBadge}<h2>{current.race_name}</h2></div>
    <p>{current.race_date.split('-').reverse().join('.')} · {current.race_location||'Ort nicht festgelegt'}</p>
    <div className="cg-tags"><span>{distanceText} km</span>
     {current.target_hours&&<span>Ziel {Number(current.target_hours).toLocaleString('de-DE')} h</span>}
     <span>{phase.title}</span></div>
    <p className="cg-guidance">{phase.guidance}</p>
   </div>
   <div className="cg-countdown"><strong>{phase.daysUntil>0?days:phase.daysUntil===0?'GO':'–'}</strong>
    <small>{phase.daysUntil>0?'TAGE BIS START':phase.daysUntil===0?'HEUTE':'ZIELÜBERBLICK'}</small></div>
  </div>}
  <p className="cg-disclaimer">{goalIsPast?'Das Rennen liegt zurück. Es bleibt für die Rennnachbereitung erhalten, ist aber kein aktives Trainingsziel.':goal?'Die Phase wird aus deinem Wettkampfdatum abgeleitet – ohne medizinische Trainingsfreigabe.':
   'Noch kein Wettkampfziel gespeichert. Lege ein neues Ziel an.'}</p>
  {goalIsPast&&<div className="cg-actions cg-mode-actions">
   <strong>{maintaining?'Trainingsniveau halten · '+trainingMode.weeklyKm+' km/Woche':'Wie möchtest du weitertrainieren?'}</strong>
   <button type="button" onClick={chooseNew}>Neues Ziel verfolgen</button>
   <button type="button" onClick={()=>setMaintainOpen(x=>!x)}>{maintaining?'Trainingsniveau ändern':'Fit halten'}</button>
   {maintainOpen&&<div className="cg-fields"><label>Gewünschter Laufumfang (km/Woche)<input type="number" min="1" max="200" step="1" value={maintainKm} onChange={e=>setMaintainKm(e.target.value)} placeholder="z. B. 45"/></label>
    <button type="button" disabled={saving||!maintainKm} onClick={()=>void saveMaintenance()}>Trainingsniveau speichern</button>
    <small>Richtwert, kein Kilometerzwang. Regeneration und aktuelle Belastbarkeit haben Vorrang.</small></div>}
  </div>}
  {goal&&<button type="button" className="cg-home-edit" disabled={saving} onClick={()=>{setEditOpen(x=>!x);setDraft(asDraft(goal))}}>{editOpen?'Bearbeitung schließen':'Ziel bearbeiten'}</button>}
  {compact?<>
    <button type="button" className="cg-link" onClick={onEdit} disabled={!onEdit}>
     Ziel & Trainingsphase bearbeiten
    </button>
   </>:
   (!goal||editOpen)&&<div className="cg-edit">
    <div className="cg-edit-head"><strong>{goal?'Gespeichertes Ziel bearbeiten':'Mein nächstes Ziel'}</strong>
     <small>{goal?'Korrekturen an diesem Rennen. Für ein neues Rennen bitte Neues Ziel verfolgen nutzen.':'Neues Wettkampfziel anlegen'}</small></div>
    <div className="cg-fields">
     <label>Wettkampf<input value={draft.raceName} maxLength={100}
      onChange={e=>setDraft(d=>({...d,raceName:e.target.value}))} placeholder="Name des Wettkampfs"/></label>
     <label>Datum<input type="date" value={draft.raceDate}
      onChange={e=>setDraft(d=>({...d,raceDate:e.target.value}))}/></label>
     <label>Distanz (km)<input type="number" min="1" max="500" step="0.1" inputMode="decimal"
      value={draft.distanceKm} onChange={e=>setDraft(d=>({...d,distanceKm:e.target.value}))}/></label>
     <label>Zielzeit (Stunden)<input type="number" min="0.1" max="100" step="0.25" inputMode="decimal"
      value={draft.targetHours} onChange={e=>setDraft(d=>({...d,targetHours:e.target.value}))}/></label>
     <label>Ort<input value={draft.raceLocation} maxLength={120}
      onChange={e=>setDraft(d=>({...d,raceLocation:e.target.value}))} placeholder="z. B. Fulda"/></label>
     <label>Startzeit (optional)<input type="time" value={draft.raceStartTime}
      onChange={e=>setDraft(d=>({...d,raceStartTime:e.target.value}))}/></label>
     <label className="cg-wide">Was soll der Coach berücksichtigen?
      <textarea rows={3} maxLength={600} value={draft.coachNote}
       onChange={e=>setDraft(d=>({...d,coachNote:e.target.value}))}
       placeholder="z. B. Rundenformat, Versorgungsstrategie, Prioritäten"/></label>
    </div>
    <div className="cg-actions"><button type="button" disabled={saving||loading} onClick={()=>void save()}>
      {saving?'Speichere Ziel …':goal?'Änderungen am Ziel speichern':'Dieses Ziel aktivieren'}
     </button>
     <small>Es werden keine Garmin-/Intervals-Workouts erzeugt oder automatisch geändert.</small></div>
   </div>}
  {loading&&<p className="cg-info">Lade gespeichertes Ziel …</p>}
  {error&&<p className="cg-error" role="alert">{error}</p>}
  {notice&&<p className="cg-notice" role="status">{notice}</p>}
  {!loading&&!ready&&!error&&<p className="cg-info">Ziel wird geladen.</p>}
 </section>
}

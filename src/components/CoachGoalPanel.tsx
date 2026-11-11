import {useEffect,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import {phaseForRace,berlinDateToday,suggestedGoal} from '../lib/coachGoal'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/coach-goal.css'

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
 raceLocation:x.race_location,raceStartTime:x.race_start_time||'',
 coachNote:x.coach_note
})
export function CoachGoalPanel({active,compact=false,onEdit,onSaved,logoUrl}:{active:boolean;compact?:boolean;onEdit?:()=>void;onSaved?:()=>void;logoUrl?:string|null}){
 const [goal,setGoal]=useState<CoachGoal|null>(null)
 const [draft,setDraft]=useState<Draft>(()=>asDraft(suggestedGoal))
 const [loading,setLoading]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [ready,setReady]=useState(false)
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setLoading(true);setError('')
  void goalRequest().then(result=>{
   if(!mounted)return
   setGoal(result.goal)
   if(result.goal)setDraft(asDraft(result.goal))
   setReady(true)
  }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Ziel nicht abrufbar')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active])
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
   onSaved?.()
  }catch(e){setError(e instanceof Error?e.message:'Ziel konnte nicht gespeichert werden.')}
  finally{setSaving(false)}
 }
 if(!active)return null
 const current=goal||suggestedGoal
 const phase=phaseForRace(current.race_date,berlinDateToday())
 const distanceText=Number(current.distance_km).toLocaleString('de-DE',{maximumFractionDigits:1})
 const days=Math.max(0,phase.daysUntil)
 return <section className={'cg-root'+(compact?' cg-compact':'')} aria-label="Trainingsziel und Vorbereitungsphase">
  <div className="cg-head">
   <span className="cg-kicker">COACH / MEIN ZIEL</span>
   <span className={'cg-state'+(goal?' is-active':'')}>{goal?'AKTIVES ZIEL':'VORSCHLAG · NOCH NICHT GESPEICHERT'}</span>
  </div>
  <div className="cg-summary">
   <div><div className="cg-title-row">{logoUrl&&<img src={logoUrl} alt={'Logo '+current.race_name} referrerPolicy="no-referrer" loading="lazy"/>}<h2>{current.race_name}</h2></div>
    <p>{current.race_date.split('-').reverse().join('.')} · {current.race_location||'Ort nicht festgelegt'}</p>
    <div className="cg-tags"><span>{distanceText} km</span>
     {current.target_hours&&<span>Ziel {Number(current.target_hours).toLocaleString('de-DE')} h</span>}
     <span>{phase.title}</span></div>
    <p className="cg-guidance">{phase.guidance}</p>
   </div>
   <div className="cg-countdown"><strong>{phase.daysUntil>0?days:phase.daysUntil===0?'GO':'–'}</strong>
    <small>{phase.daysUntil>0?'TAGE BIS START':phase.daysUntil===0?'HEUTE':'ZIELÜBERBLICK'}</small></div>
  </div>
  <p className="cg-disclaimer">{goal?'Die Phase wird aus deinem Wettkampfdatum abgeleitet – ohne medizinische Trainingsfreigabe.':
   'Das bekannte Heartbeat-Ziel ist nur vorbelegt. Du bestätigst es unten ausdrücklich.'}</p>
  {compact?<>
    <button type="button" className="cg-link" onClick={onEdit} disabled={!onEdit}>
     Ziel & Trainingsphase bearbeiten
    </button>
   </>:
   <div className="cg-edit">
    <div className="cg-edit-head"><strong>Mein nächstes Ziel</strong>
     <small>{goal?'Wettkampfziel ändern':'Vorschlag prüfen und als Coach-Ziel übernehmen'}</small></div>
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

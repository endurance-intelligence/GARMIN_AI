import {useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {
 buildOrcWorkout,ORC_GROUPS,ORC_POSTER_TITLE,orcDraftNotes
} from '../lib/orcTrackWorkout'
import type {OrcGroup} from '../lib/orcTrackWorkout'
import '../styles/orc-track.css'

type ExistingPlan={id:string;training_date:string;title:string;state:string}
function canUseDate(value:string){
 const iso=/^\d{4}-\d{2}-\d{2}$/.test(value)
 return iso&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&
  new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value
}
export function OrcTrackBuilder({date,hasGarminWorkout,onSaved}:{
 date:string;hasGarminWorkout:boolean;onSaved:()=>void
}){
 const [group,setGroup]=useState<OrcGroup>('Wolf')
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [done,setDone]=useState('')
 const seen=useRef<Map<string,string>>(new Map())
 const workout=buildOrcWorkout(group)
 const intervals=workout.steps.filter(step=>step.kind==='interval')
 const key=date+'|'+group
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const part=(k:string)=>parts.find(p=>p.type===k)?.value||''
 const today=part('year')+'-'+part('month')+'-'+part('day')
 const usable=canUseDate(date)&&date>=today
 const targetDate=canUseDate(date)?date.split('-').reverse().join('.'):date
 async function save(){
  if(saving||!usable||!garminSupabase)return
  setSaving(true);setError('');setDone('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden')
   const headers={
    authorization:'Bearer '+session.access_token,
    apikey:garminPublishableKey
   }
   const path=garminSupabaseUrl+'/functions/v1/garmin-training-plan'
   // Verify whether the same session already has a local draft on that date.
   // This avoids duplicate plans across refreshes, not just repeat clicks.
   const existing=await fetch(path,{headers,cache:'no-store'})
   if(!existing.ok)throw Error('Bestehende Trainings konnten nicht geprüft werden')
   const read=await existing.json() as {entries?:ExistingPlan[]}
   if(read.entries?.some(p=>p.training_date===date&&
       p.title===workout.name&&p.state!=='cancelled')){
    setDone('Dieses ORC-Training ist für den Tag bereits als Entwurf vorhanden.')
    return
   }
   let requestId=seen.current.get(key)
   if(!requestId){
    requestId=crypto.randomUUID()
    seen.current.set(key,requestId)
   }
   const body={
    action:'create',clientRequestId:requestId,date,
    title:workout.name,sessionType:'event',sport:'running',
    notes:orcDraftNotes(workout)
   }
   const res=await fetch(path,{
    method:'POST',headers:{...headers,'content-type':'application/json'},
    cache:'no-store',body:JSON.stringify(body)
   })
   if(!res.ok)throw Error('Entwurf konnte nicht gespeichert werden ('+res.status+')')
   const payload=await res.json() as {saved?:boolean}
   if(payload.saved!==true)throw Error('Speichern nicht bestätigt')
   setDone('ORC '+group+' ist für '+targetDate+' als Entwurf gespeichert.')
   onSaved()
  }catch(e){
   setError(e instanceof Error?e.message:'Speichern aktuell nicht möglich')
  }finally{setSaving(false)}
 }
 return <details className="orc-builder">
  <summary>
   <span className="orc-mark">ORC</span>
   <span className="orc-summary">
    <strong>Bahntraining aus der Grafik</strong>
    <small>Gruppe auswählen · Einheiten prüfen · Entwurf speichern</small>
   </span>
   <span className="orc-chevron" aria-hidden="true">⌄</span>
  </summary>
  <div className="orc-content">
   <div className="orc-picker">
    <div>
     <span className="orc-kicker">ORC TRACK · {ORC_POSTER_TITLE.toUpperCase()}</span>
     <h3>Deine Gruppe, dein Tempo.</h3>
     <p>Aus der eingesendeten ORC-Grafik übernommen – keine automatisch wiederholte Samstagseinheit.</p>
    </div>
    <label>Gruppe
     <select value={group} onChange={e=>{
      setGroup(e.target.value as OrcGroup);setError('');setDone('')
     }}>{ORC_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}</select>
    </label>
   </div>
   <div className="orc-measures">
    <div><small>Datum</small><strong>{targetDate}</strong></div>
    <div><small>Intervalle</small><strong>{workout.intervalCount} × 1000 m</strong></div>
    <div><small>Blöcke</small><strong>{workout.blocks.join(' + ')}</strong></div>
    <div><small>Mindestens</small><strong>{(workout.minimumMeters/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} km</strong></div>
   </div>
   <div className="orc-sequence" aria-label={'Intervallfolge '+group}>
    {intervals.map((step,i)=><div className="orc-effort" key={i}>
      <div className={'orc-effort-pill orc-tone-'+(i%3)}>{step.pace?.label}</div>
      <small>{i+1}</small>
    </div>)}
   </div>
   <p className="orc-structure"><strong>Ablauf:</strong> 2 km Einlaufen · Minibänder ·
    {workout.intervalCount} × 1000 m mit den Tempi oben · jeweils 200 m Trabpause.
    Nach Block 1 und 2 trinken. Locker auslaufen, dann dehnen.</p>
   <p className="orc-workout-hint">Die Tempovorgaben gelten pro Kilometer.
    Für die spätere Garmin-Uhr sind die Intervalle als Distanzschritte vorgesehen,
    die Minibandübungen und das Auslaufen ohne feste Zeit.</p>
   {hasGarminWorkout&&<p className="orc-existing">
    Für diesen Tag steht bereits ein Garmin-Training im Kalender. Der neue Entwurf
    ersetzt oder verändert es nicht.
   </p>}
   <div className="orc-actions">
    <span>Garmin-Workout-Erstellung noch nicht freigeschaltet.</span>
    <button type="button" disabled={!usable||saving} onClick={()=>void save()}>
     {saving?'Speichere …':'Als Entwurf speichern'}
    </button>
   </div>
   {!usable&&<p className="orc-error">Bitte einen heutigen oder zukünftigen Trainingstag auswählen.</p>}
   {done&&<p className="orc-done" role="status">{done}</p>}
   {error&&<p className="orc-error" role="alert">{error}</p>}
  </div>
 </details>
}

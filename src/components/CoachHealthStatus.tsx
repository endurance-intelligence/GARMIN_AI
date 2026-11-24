import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {berlinDateToday} from '../lib/coachGoal'
import {coachAddDays} from '../lib/coachSevenDay.mjs'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import type {CoachContextPayload} from './CoachLifeContext'
import {Icon} from './Icon'
import '../styles/coach-health-status.css'

type Category='illness'|'pain'|'fatigue'|'other'
type Duration='today'|'until'|'open'
type Response={saved?:boolean;context?:CoachContextPayload['context'];error?:string}
const fmt=(d:string|null|undefined)=>d?d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4):'–'
const categories:Record<Category,string>={
 illness:'Infekt / Krankheitsgefühl',pain:'Schmerzen / Verletzung',
 fatigue:'Erschöpfung / Überlastung',other:'Andere Beschwerden'
}
export function CoachHealthStatus({active,life,onChanged,openToken=0}:{active:boolean;
 life:CoachContextPayload|null|undefined;onChanged:()=>void;openToken?:number}){
 const [open,setOpen]=useState(false)
 useEffect(()=>{if(active&&openToken>0)setOpen(true)},[active,openToken])
 const [category,setCategory]=useState<Category>('illness')
 const [startedOn,setStartedOn]=useState(berlinDateToday)
 const [duration,setDuration]=useState<Duration>('today')
 const [until,setUntil]=useState(berlinDateToday)
 const [recoveryChecked,setRecoveryChecked]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const context=life?.context
 const status=context?.illness_state||'well'
 const today=berlinDateToday()
 useEffect(()=>{
  if(!open)return
  setError('');setRecoveryChecked(false)
  if(status==='sick'){
   setCategory((context?.illness_kind||'illness') as Category)
   setStartedOn(context?.illness_started_on||today)
   setDuration(context?.illness_expected_end_on?
    context.illness_expected_end_on===today?'today':'until':'open')
   setUntil(context?.illness_expected_end_on||today)
  }else{
   setCategory('illness');setStartedOn(today);setDuration('today');setUntil(today)
  }
 },[open,status,today,context?.illness_started_on,context?.illness_expected_end_on,context?.illness_kind])
 useEffect(()=>{
  if(!open)return
  const old=document.body.style.overflow
  document.body.style.overflow='hidden'
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)setOpen(false)}
  window.addEventListener('keydown',onKey)
  return ()=>{document.body.style.overflow=old;window.removeEventListener('keydown',onKey)}
 },[open,busy])
 async function send(action:Record<string,unknown>){
  if(busy||!garminSupabase)return
  setBusy(true);setError('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-context',{
    method:'POST',cache:'no-store',headers:{
     authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'
    },body:JSON.stringify(action)})
   const json=await res.json().catch(()=>({})) as Response
   if(!res.ok||!json.saved)throw Error(json.error||'Trainingsstatus wurde nicht gespeichert.')
   setOpen(false)
   onChanged()
  }catch(e){setError(e instanceof Error?e.message:'Trainingspause konnte nicht gespeichert werden.')}
  finally{setBusy(false)}
 }
 const save=()=>{
  const expectedEnd=duration==='open'?null:duration==='today'?today:until
  void send({action:status==='sick'?'update_illness':'start_illness',
   startedOn,status:status==='sick'?'sick':'well',kind:category,expectedEnd})
 }
 const reviewRuns=()=>{
  setOpen(false)
  requestAnimationFrame(()=>{
   const detail=document.getElementById('c7-life-settings') as HTMLDetailsElement|null
   if(detail){detail.open=true;detail.scrollIntoView({behavior:'smooth',block:'start'})}
  })
 }
 if(!active)return null
 return <>
  <button type="button" className={'co-health-button co-health-'+status} onClick={()=>setOpen(true)} disabled={!context}
   aria-haspopup="dialog" aria-label="Krankheit, Beschwerden und Wiedereinstieg verwalten">
   <Icon name="heart-pulse"/>
   <span>{!context?'Status laden …':status==='sick'?'Trainingspause aktiv':status==='returning'?'Wiedereinstieg':'Krank / Beschwerden'}</span>
  </button>
  {open&&createPortal(<div className="co-health-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false)}}>
   <section className="co-health-dialog" role="dialog" aria-modal="true" aria-labelledby="co-health-title">
    <div className="co-health-dialog-head">
     <div><span className="co-health-eyebrow">COACH · DEIN GESUNDHEITSSTATUS</span>
      <h2 id="co-health-title">{status==='returning'?'Behutsam zurück ins Training':
       status==='sick'?'Trainingspause verwalten':'Krank oder Beschwerden?'}</h2>
      <p>Du bestimmst deinen Status. Der Coach übernimmt ihn in die Trainingsplanung.</p></div>
     <button type="button" className="co-health-close" aria-label="Schließen"
      onClick={()=>setOpen(false)} disabled={busy}>×</button>
    </div>
    {status!=='returning'?<>
     {status==='sick'&&<div className="co-health-active"><Icon name="calendar-off"/>
      <span>Pause seit {fmt(context?.illness_started_on)}. Keine neuen intensiven Trainingsvorschläge.</span></div>}
     <div className="co-health-fields">
      <label>Was trifft am ehesten zu?
       <select value={category} onChange={e=>setCategory(e.target.value as Category)}>
        {Object.entries(categories).map(([key,label])=><option value={key} key={key}>{label}</option>)}
       </select>
      </label>
      <label>Seit wann?
       <input type="date" min={coachAddDays(today,-14)} max={today} value={startedOn}
        disabled={status==='sick'}
        onChange={e=>setStartedOn(e.target.value)}/>
      </label>
      <fieldset><legend>Wie lange voraussichtlich?</legend>
       <div className="co-health-duration">
        {([{key:'today',label:'Nur heute'},{key:'until',label:'Mehrere Tage'},
          {key:'open',label:'Noch offen'}] as {key:Duration;label:string}[]).map(x=>
         <label className={duration===x.key?'is-selected':''} key={x.key}>
          <input type="radio" name="co-illness-duration" checked={duration===x.key}
           onChange={()=>setDuration(x.key)}/>{x.label}
         </label>)}
       </div>
      </fieldset>
      {duration==='until'&&<label>Voraussichtlich bis einschließlich
       <input type="date" value={until} min={today} max={coachAddDays(startedOn,90)}
        onChange={e=>setUntil(e.target.value)}/>
      </label>}
     </div>
     <p className="co-health-guidance">Die Dauer ist eine Schätzung, keine automatische Freigabe.
      Der Coach pausiert belastende Vorschläge, bis du den Wiedereinstieg ausdrücklich startest.
      Bereits gespeicherte Trainings werden nicht automatisch gelöscht.</p>
     {error&&<p className="co-health-error" role="alert">{error}</p>}
     <div className="co-health-actions">
      <button type="button" className="co-health-primary" disabled={busy||
       !startedOn||startedOn>today||startedOn<coachAddDays(today,-14)||
       (duration==='until'&&(!until||until<today||until>coachAddDays(startedOn,90)))}
       onClick={save}>{busy?'Speichere …':status==='sick'?'Dauer aktualisieren':'Trainingspause speichern'}</button>
      {status==='sick'&&<button type="button" className="co-health-secondary"
       onClick={()=>setRecoveryChecked(v=>!v)} disabled={busy}>
        {recoveryChecked?'✓ Wiedereinstieg bestätigen':'Wiedereinstieg vorbereiten'}
       </button>}
     </div>
     {status==='sick'&&recoveryChecked&&<div className="co-health-return">
      <p>Ich habe keine relevanten Beschwerden oder Warnzeichen mehr. Nach Fieber oder
       stärkeren Beschwerden kläre ich bei Bedarf die Rückkehr medizinisch ab.
       Die ersten beiden Läufe werden vorsichtig geplant und am Folgetag bewertet.</p>
      <button type="button" disabled={busy} onClick={()=>void send({action:'start_return',confirmRecovered:true})}>
       Wiedereinstieg ausdrücklich beginnen
      </button>
     </div>}
    </>:
    <div className="co-health-return-mode">
     <p>Wiedereinstieg seit <strong>{fmt(context?.return_started_on)}</strong>.
      Erst lockere Belastungen und die Verträglichkeit am Folgetag prüfen.
      Ein automatischer Sprung zurück zu Intervallen oder vollem Umfang findet nicht statt.</p>
     <button type="button" className="co-health-primary" onClick={reviewRuns}>
      Erste Läufe bewerten & Freigabe prüfen <Icon name="arrow-up-right"/></button>
     <button type="button" className="co-health-secondary" disabled={busy}
      onClick={()=>void send({action:'start_illness',startedOn:today,kind:'illness',expectedEnd:null})}>
      Beschwerden erneut melden</button>
     {error&&<p className="co-health-error" role="alert">{error}</p>}
    </div>}
    <p className="co-health-disclaimer">Keine Diagnose. Bei Brustschmerzen, Atemnot,
     Schwindel, anhaltendem Fieber oder auffälligen Beschwerden medizinisch abklären.</p>
   </section>
  </div>,document.body)}
 </>
}

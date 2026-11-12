import {useState} from 'react'
import {berlinDateToday} from '../lib/coachGoal'
import {coachAddDays} from '../lib/coachSevenDay.mjs'
import {Icon} from './Icon'
import '../styles/coach-life-context.css'

export type CoachBlock={id:string;start:string;end:string;reason:'vacation'|'unavailable'}
export type CoachRunReview={activityId:string;assessment:'ok'|'concern';reviewedOn:string}
export type CoachContext={
 illness_state:'well'|'sick'|'returning';illness_started_on:string|null;
 return_started_on:string|null;blocked_periods:CoachBlock[];run_reviews:CoachRunReview[];
 updated_at:string
}
export type CoachRun={
 activity_id:string;activity_name:string|null;start_time_local:string|null;
 distance_m:number|null;duration_s:number|null;average_heart_rate:number|null;rpe_raw:number|null
}
export type CoachContextPayload={context:CoachContext;runs:CoachRun[]}
type Action={action:string;[key:string]:string|boolean}
type Props={life:CoachContextPayload|null;busy:boolean;onAction:(action:Action)=>Promise<void>}
const short=(day:string)=>day.slice(8,10)+'.'+day.slice(5,7)+'.'+day.slice(0,4)
const valid=(n:number|null)=>typeof n==='number'&&Number.isFinite(n)
const fmt=(n:number|null,digits=0)=>valid(n)?n!.toLocaleString('de-DE',{
 maximumFractionDigits:digits,minimumFractionDigits:digits}):'–'
export function CoachLifeContext({life,busy,onAction}:Props){
 const today=berlinDateToday()
 const [start,setStart]=useState(today)
 const [end,setEnd]=useState(today)
 const [reason,setReason]=useState<'vacation'|'unavailable'>('vacation')
 const [recoveredCheck,setRecoveredCheck]=useState(false)
 const [finishCheck,setFinishCheck]=useState(false)
 if(!life)return <p className="clc-error" role="status">
  Persönlichen Coach-Kontext laden. Ohne diesen Status werden keine Trainingsvorschläge freigegeben.
 </p>
 const {context:r,runs}=life
 const reviews=r.run_reviews||[]
 const firstTwo=runs.slice(0,2)
 const ready=firstTwo.length===2&&runs.every(run=>reviews.some(
  review=>review.activityId===run.activity_id&&review.assessment==='ok'))
 const notOk=reviews.some(x=>x.assessment==='concern')
 const doAction=(a:Action)=>{void onAction(a)}
 return <section className="clc-root" aria-label="Persönliche Trainingsunterbrechungen">
  <div className="clc-head">
   <div><span>COACH / LEBEN & ERHOLUNG</span>
    <h3>Der Plan passt sich dir an.</h3>
    <p>Krankheit und freie Tage werden gespeichert. Ausgefallene Kilometer werden nicht nachgeholt.</p></div>
   <span className={'clc-mode clc-'+r.illness_state}>
    {r.illness_state==='sick'?'Krank · Pause':r.illness_state==='returning'?'Wiedereinstieg':'Normalmodus'}
   </span>
  </div>
  <div className="clc-card">
   <div className="clc-card-title"><Icon name="heart-pulse"/> <strong>Krankheit & Wiedereinstieg</strong></div>
   {r.illness_state==='well'&&<>
    <p>Geht es dir nicht gut, pausiert der Coach neue Trainingsvorschläge, bis du die Genesung meldest.</p>
    <button type="button" disabled={busy} onClick={()=>doAction({action:'start_illness'})}>Ich bin krank / habe Beschwerden</button>
   </>}
   {r.illness_state==='sick'&&<>
    <p><strong>Trainingspause aktiv seit {r.illness_started_on?short(r.illness_started_on):'deiner Meldung'}.</strong>
     Keine Intervalle, Nachholeinheiten oder Vorschläge. Bereits geplante Termine bitte selbst prüfen.</p>
    <label className="clc-checkbox"><input type="checkbox" checked={recoveredCheck}
     onChange={e=>setRecoveredCheck(e.target.checked)}/>
     Die Beschwerden sind abgeklungen, ich bin fieberfrei und habe keine Warnzeichen.
     Falls die Erkrankung stärker war oder ich unsicher bin, hole ich ärztlichen Rat ein.</label>
    <button type="button" disabled={busy||!recoveredCheck}
     onClick={()=>{doAction({action:'start_return',confirmRecovered:true});setRecoveredCheck(false)}}>
     Wiedereinstieg beginnen</button>
   </>}
   {r.illness_state==='returning'&&<>
    <p><strong>Wiedereinstieg seit {r.return_started_on?short(r.return_started_on):'deiner Meldung'}.</strong>
     Der Coach wartet nach jedem Lauf auf Garmin-Daten und deine Bewertung am Folgetag.
     Kein automatischer Übergang zu Intervallen oder voller Trainingsbelastung.</p>
    {notOk&&<p className="clc-warning" role="alert">Bei einem Wiedereinstiegslauf wurden Beschwerden gemeldet.
     Weitere Trainingsvorschläge sind gesperrt. Bei Brustschmerzen, Atemnot, Herzrasen,
     Schwindel oder ungewöhnlicher Erschöpfung bitte Training abbrechen und medizinisch abklären.</p>}
    <div className="clc-runs">
     <strong>Die ersten Garmin-Läufe</strong>
     {!runs.length&&<p>Noch kein Lauf nach deiner Wiedereinstiegsmeldung erfasst.
      Nach dem ersten lockeren Versuch prüfen wir Dauer, Herzfrequenz, RPE (falls vorhanden) und dein Befinden.</p>}
     {runs.map((run,i)=>{
      const date=run.start_time_local?.slice(0,10)||''
      const review=reviews.find(x=>x.activityId===run.activity_id)
      return <article key={run.activity_id} className="clc-run">
       <div><strong>{i+1}. {date?short(date):'Datum unbekannt'} · {run.activity_name||'Lauf'}</strong>
        <p>{fmt(valid(run.distance_m)?run.distance_m!/1000:null,1)} km ·
         {fmt(valid(run.duration_s)?run.duration_s!/60:null)} Min. ·
         HF Ø {fmt(run.average_heart_rate)} bpm · RPE {fmt(run.rpe_raw)}</p>
        <small>Die Garmin-Zahlen beschreiben Belastung, bestätigen aber keine Genesung.</small></div>
       {review?<span className={'clc-assess clc-'+review.assessment}>
        {review.assessment==='ok'?'Am Folgetag gut vertragen':'Beschwerden gemeldet'}</span>:
        date>=today?<small>Frühestens am Folgetag bewerten.</small>:
        <div className="clc-run-actions">
         <button type="button" disabled={busy}
          onClick={()=>doAction({action:'review_run',activityId:run.activity_id,assessment:'ok'})}>
          Auch danach gut vertragen</button>
         <button type="button" disabled={busy} className="clc-alert-button"
          onClick={()=>doAction({action:'review_run',activityId:run.activity_id,assessment:'concern'})}>
          Beschwerden bemerkt</button>
        </div>}
      </article>
     })}
    </div>
    <div className="clc-return-actions">
     <button type="button" className="clc-secondary" disabled={busy}
      onClick={()=>doAction({action:'start_illness'})}>Wieder in den Krank-Modus</button>
     {ready&&!notOk&&<>
      <label className="clc-checkbox"><input type="checkbox" checked={finishCheck}
       onChange={e=>setFinishCheck(e.target.checked)}/>
       Ich habe die ersten Läufe einschließlich des Folgetags ohne Beschwerden vertragen
       und möchte die normale Planung wieder aktivieren.</label>
      <button type="button" disabled={busy||!finishCheck}
       onClick={()=>{doAction({action:'finish_return',confirmWell:true});setFinishCheck(false)}}>
       Normalmodus ausdrücklich freigeben</button>
     </>}
     {!ready&&!notOk&&<p>Normalmodus erst möglich, wenn mindestens zwei erste Läufe
      am Folgetag als gut vertragen bestätigt sind. Bis dahin keine automatische Freigabe.</p>}
    </div>
   </>}
  </div>
  <div className="clc-card">
   <div className="clc-card-title"><Icon name="calendar-off"/> <strong>Urlaub & nicht verfügbare Tage</strong></div>
   <p>Trage einzelne Tage oder Zeiträume ein. Der Coach plant dort keine Einheiten.
    Bereits gespeicherte Termine werden nicht gelöscht.</p>
   <div className="clc-form">
    <label>Grund<select value={reason} onChange={e=>setReason(e.target.value as 'vacation'|'unavailable')}>
     <option value="vacation">Urlaub</option><option value="unavailable">Keine Zeit / privat</option>
    </select></label>
    <label>Von<input type="date" min={today} max={coachAddDays(today,365)}
     value={start} onChange={e=>{setStart(e.target.value);if(e.target.value>end)setEnd(e.target.value)}}/></label>
    <label>Bis<input type="date" min={start||today} max={coachAddDays(today,365)}
     value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <button type="button" disabled={busy||!start||!end||end<start||
     end>coachAddDays(start,60)}
     onClick={()=>doAction({action:'add_block',start,end,reason})}>Zeitraum blockieren</button>
   </div>
   {(r.blocked_periods||[]).length>0&&<div className="clc-periods">
    {[...r.blocked_periods].sort((a,b)=>a.start.localeCompare(b.start)).map(p=>
     <div key={p.id}><span><Icon name={p.reason==='vacation'?'plane':'calendar-off'}/>
      {p.reason==='vacation'?'Urlaub':'Keine Zeit'} · {short(p.start)}–{short(p.end)}</span>
      <button type="button" className="clc-secondary" disabled={busy}
       onClick={()=>doAction({action:'remove_block',id:p.id})}>Entfernen</button></div>)}
   </div>}
  </div>
  <p className="clc-disclaimer">Dieses Protokoll ist keine ärztliche Diagnose oder Freigabe.
   Bei schweren Symptomen, anhaltendem Fieber oder Herz-/Atembeschwerden ärztlich abklären.
   Dauer und Intensität beim Wiedereinstieg sind bewusst niedrig. Garmin- und Kalendereinträge
   werden nicht automatisch verändert.</p>
 </section>
}

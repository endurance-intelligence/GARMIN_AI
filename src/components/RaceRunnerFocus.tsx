import {useEffect,useMemo,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import type {RaceCheckpoint} from '../lib/raceExecution.mjs'
import type {GelPlanEvent} from '../lib/gelTiming.mjs'
import type {AidPlanEvent} from '../lib/raceAidPlan.mjs'
import {buildRunnerFocus} from '../lib/raceRunnerFocus.mjs'
import {raceElapsedNow} from '../lib/raceDayCockpit.mjs'
import {Icon} from './Icon'
import '../styles/race-runner-focus.css'

/** Race-day glance card: only next round and next planned actions, no distance/pace/time budget. */
export function RaceRunnerFocus({active,goal,checkpoints,completed,fuelSchedule,aidSchedule,
 startTime,loaded,storageReady,planSaved,notice,warning,onComplete,onUndo}:{
 active:boolean;goal:CoachGoal;checkpoints:RaceCheckpoint[];completed:number;
 fuelSchedule:GelPlanEvent[]|null;aidSchedule:AidPlanEvent[]|null;
 startTime:string;loaded:boolean;
 storageReady:boolean;planSaved:boolean;notice:string;warning:string;
 onComplete:()=>void;onUndo:()=>void
}){
 const [clockTick,setClockTick]=useState(()=>Date.now())
 useEffect(()=>{
  if(!active)return
  setClockTick(Date.now())
  const timer=window.setInterval(()=>setClockTick(Date.now()),45000)
  return ()=>window.clearInterval(timer)
 },[active])
 const elapsed=useMemo(()=>raceElapsedNow({
  raceDate:goal.race_date,startTime,now:new Date(clockTick)
 }),[goal.race_date,startTime,clockTick])
 const view=buildRunnerFocus({checkpoints,completed,gelEvents:fuelSchedule,
  aidEvents:aidSchedule,elapsedMinutes:elapsed})
 if(!active||!view.total)return null
 const gel=view.gel
 return <section className="rrf-root" aria-label="Runner Mode: nächste Runde und Versorgung">
  <header className="rrf-head">
   <strong><Icon name="flag"/> RUNNER MODE</strong>
   <div className="rrf-readiness" aria-label="Renntag-Vorbereitung">
    <span className={storageReady&&loaded?'is-ready':'is-pending'}>
     <Icon name={storageReady&&loaded?'check-circle':'alert-circle'}/>
     {storageReady&&loaded?'Rundenspeicher geprüft':'Rundenspeicher nicht bereit'}
    </span>
    <span className={fuelSchedule!==null?'is-ready':'is-pending'}>
     <Icon name={fuelSchedule!==null?'check-circle':'info'}/>
     {fuelSchedule===null?'Gel Buddy noch nicht geladen':
      fuelSchedule.length?'Gel Buddy bereit':'Noch kein Gel eingeplant'}
    </span>
    {!planSaved&&<span className="is-pending"><Icon name="info"/>
     Rennplan nicht gespeichert</span>}
   </div>
  </header>

  {warning&&<p className="rrf-alert" role="alert">{warning}</p>}
  {!warning&&notice&&<p className="rrf-confirmation" role="status">{notice}</p>}

  <div className="rrf-primary">
   <div className="rrf-center" aria-live="polite" aria-atomic="true">
    <span className="rrf-eyebrow">{view.finished?'ALLE RUNDEN ERFASST':'DEINE NÄCHSTE RUNDE'}</span>
    <div className="rrf-round-line">
     <strong className="rrf-round">{view.finished?'Geschafft!':'Runde '+view.nextIndex}</strong>
     {!view.finished&&<span className="rrf-total">/ {view.total}</span>}
    </div>
    <span className="rrf-remaining">{view.finished?'Alle Abschnitte bestätigt.':
     'Eine Runde nach der anderen.'}</span>
   </div>
   <div className="rrf-actions">
    {!view.finished?<button type="button" className="rrf-done" disabled={!loaded}
     onClick={onComplete}><Icon name="check-circle"/> Runde geschafft</button>:
     <p className="rrf-finished">Du musst hier nichts weiter erfassen. Gut gemacht!</p>}
    {view.completed>0&&<button type="button" className="rrf-undo" disabled={!loaded}
     onClick={onUndo}>Letzte Runde korrigieren</button>}
   </div>
  </div>

  {!view.finished&&<div className={'rrf-break'+(view.longPause?' is-long':'')}>
   <Icon name={view.longPause?'flag':'check'}/>
   <div><small>NACH DIESER RUNDE</small><strong>{view.breakNote?.replace(/^Nach dieser Runde:\s*/, '')}</strong></div>
  </div>}

  {!view.finished&&view.meal&&
   <div className="rrf-meal" aria-label="Verpflegungsvorschlag für diese Runde">
    <div className="rrf-meal-heading">
     <span><Icon name="check-circle"/> WAS NACH DIESER RUNDE ESSEN?</span>
     <small>Einfacher Vorschlag · nichts automatisch verbucht</small>
    </div>
    <div className="rrf-meal-primary">
     <Icon name={view.meal.primaryKind==='gel'?'check-circle':'flag'}/>
     <div>
      <small>{view.meal.primaryKind==='gel'?
       view.gelTiming==='due'?'Jetzt Gel: ':'GEL AUS DEINEM PLAN':
       'ESSEN AN DER STATION'}</small>
      <strong>{view.meal.primary}</strong>
      <span>{view.meal.primaryKind==='food'?
       view.meal.foodConfirmed?'Aus deinen bestätigten Essensoptionen.':
       'Nur falls vor Ort angeboten und gut verträglich.':
       'Geplantes Gel · nicht als eingenommen bestätigt.'}</span>
     </div>
    </div>
    <div className="rrf-meal-bottom">
     <div><small>ALTERNATIVE</small>
      <strong>{view.meal.alternative}</strong>
      {view.meal.alternativeKind==='food'&&!view.meal.foodConfirmed&&
       <span>Nur wenn vor Ort vorhanden.</span>}
     </div>
     <div><small>TRINKEN</small>
      <strong>{view.drinkDue?'Jetzt trinken · ':''}{view.meal.drink}</strong>
      {!view.meal.drinkConfirmed&&<span>Menge und Mischung nicht bestätigt.</span>}
     </div>
    </div>
    {view.meal.caffeineMg>0&&<p className="rrf-meal-caffeine">
     Koffein: {view.meal.caffeineMg} mg aus dem Gel – nur nach deiner Freigabe.</p>}
    {!view.meal.foodConfirmed&&<p className="rrf-meal-hint">
     Nudeln, Brötchen und andere Speisen sind Ideen, keine bestätigte Veranstalterliste.
     Falls du Essen statt Gel nimmst, den KH-Plan entsprechend prüfen.</p>}
    {view.nextAid&&<span className="rrf-meal-aid-status">Streckenversorgung eingeplant</span>}
   </div>}

  <details className="rrf-footer"><summary>Hinweise zur Runden-Erfassung</summary>
   <p>Die Runden werden nach deinem Tipp lokal gesichert.
    Keine Garmin- oder Zeitnahme-Verbindung. Bei Verbindungsproblemen die bereits
    geöffnete App offen halten: Ein vollständiger Neustart ohne Internet ist wegen
    der sicheren Anmeldung nicht garantiert. Crew-Details bleiben eingeklappt.</p>
  </details>
 </section>
}

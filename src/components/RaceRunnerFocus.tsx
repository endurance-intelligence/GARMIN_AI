import {useEffect,useMemo,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import type {RaceCheckpoint} from '../lib/raceExecution.mjs'
import type {GelPlanEvent} from '../lib/gelTiming.mjs'
import type {AidPlanEvent} from '../lib/raceAidPlan.mjs'
import {buildRunnerFocus} from '../lib/raceRunnerFocus.mjs'
import {buildRaceFuelRoadmap} from '../lib/raceFuelRoadmap.mjs'
import {eventMenuForRace} from '../lib/raceEventMenu.mjs'
import {recentFuelFeedback} from '../lib/raceFuelLog.mjs'
import type {FuelMarks,FuelMarkStatus} from '../lib/raceFuelLog.mjs'
import {raceElapsedNow} from '../lib/raceDayCockpit.mjs'
import {Icon} from './Icon'
import '../styles/race-runner-focus.css'

/** Race-day glance card: only next round and next planned actions, no distance/pace/time budget. */
export function RaceRunnerFocus({active,goal,checkpoints,completed,fuelSchedule,aidSchedule,
 fuelMarks,onFuelMark,startTime,loaded,storageReady,planSaved,notice,warning,onComplete,onUndo}:{
 active:boolean;goal:CoachGoal;checkpoints:RaceCheckpoint[];completed:number;
 fuelSchedule:GelPlanEvent[]|null;aidSchedule:AidPlanEvent[]|null;
 fuelMarks:FuelMarks;onFuelMark:(round:number,status:FuelMarkStatus|null)=>void;
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
 const eventMenu=eventMenuForRace({raceName:goal.race_name,raceDate:goal.race_date})
 const view=buildRunnerFocus({checkpoints,completed,gelEvents:fuelSchedule,
  aidEvents:aidSchedule,elapsedMinutes:elapsed,eventMenu})
 const roadmap=useMemo(()=>buildRaceFuelRoadmap({
  checkpoints,gelEvents:fuelSchedule,aidEvents:aidSchedule,eventMenu
 }),[checkpoints,fuelSchedule,aidSchedule,eventMenu])
 const roundAdvice=roadmap.rounds[view.completed]||null
 const feedback=recentFuelFeedback(fuelMarks,{completed:view.completed,total:view.total})
 if(!active||!view.total)return null
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
     <span><Icon name="check-circle"/> DIESE RUNDE · VERPFLEGUNG</span>
     <small>{roundAdvice?roundAdvice.pauseName+' · '+roundAdvice.phaseName+' · ':''}nichts automatisch verbucht</small>
    </div>
    <div className="rrf-meal-primary">
     <Icon name={view.meal.primaryKind==='gel'?'check-circle':'flag'}/>
     <div>
      <small>{view.meal.primaryKind==='gel'?
       view.meal.gelDue?'Jetzt Gel: ':'GEL IN DIESER RUNDE':
       'ESSEN NACH DER RUNDE'}</small>
      <strong>{view.meal.primary}</strong>
      <span>{view.meal.primaryKind==='food'?
       view.meal.foodConfirmed?
        view.meal.foodCarbsCounted?
         'Als Portion im KH-Plan berücksichtigt · nicht als gegessen bestätigt.':
         'Angebot bestätigt · KH der Portion nicht eingerechnet.':
        view.meal.foodAvailableAtEvent?
         'Laut Veranstalterangebot vorhanden · Portion und Verfügbarkeit an diesem Stopp prüfen · keine KH angerechnet.':
         'Nur falls vor Ort angeboten und gut verträglich · keine KH angerechnet.':
       'Dieses Gel ist bereits im KH-Plan berücksichtigt, nicht als eingenommen bestätigt.'}</span>
     </div>
    </div>
    <div className="rrf-meal-bottom">
     <div><small>{view.meal.foodIsAdditional?'ZUSÄTZLICH EINGEPLANT':'ALTERNATIVE'}</small>
      <strong>{view.meal.alternative}</strong>
      {view.meal.foodIsAdditional?
       <span>Auch diese Essensportion zählt bereits zum KH-Plan.</span>:
       <span>{view.meal.foodConfirmed?
        'Bei Ersatz die KH-Menge prüfen.':
        view.meal.foodAvailableAtEvent?
         'Laut Veranstalterangebot · an diesem Stopp prüfen. Kein automatischer Gel-Ersatz.':
         'Nur wenn vor Ort vorhanden und verträglich. Kein automatischer Gel-Ersatz.'}</span>}
     </div>
     <div><small>TRINKEN</small>
      <strong>{view.drinkDue?'Jetzt trinken · ':''}{view.meal.drink}</strong>
      {!view.meal.drinkConfirmed&&<span>Menge und Mischung nicht bestätigt.</span>}
      {view.meal.drinkConfirmed&&view.meal.plannedDrinkCarbsG>0&&
       <span>Getränke-KH im Plan berücksichtigt, nicht als getrunken bestätigt.</span>}
     </div>
    </div>
    {roundAdvice&&<p className="rrf-meal-guidance">{roundAdvice.coachHint}</p>}
    {view.meal.additionalGelNames.length>0&&<p className="rrf-meal-extra">
     Weitere in dieser Runde eingeplante Gels:
     {' '}{view.meal.additionalGelNames.join(', ')}.
     Das sind keine zusätzlichen Empfehlungen, sondern bereits berücksichtigte Portionen.</p>}
    {(roundAdvice?.caffeineMg||0)>0&&<p className="rrf-meal-caffeine">
     Koffein: {roundAdvice!.caffeineMg} mg aus den für diese Runde eingeplanten Gels – nur nach deiner Freigabe.</p>}
    {!view.meal.foodConfirmed&&<p className="rrf-meal-hint">
     {view.meal.foodAvailableAtEvent?
      'Dieses Essen steht auf deiner bestätigten Veranstalterliste. Verfügbarkeit je Stopp und Portionsgröße bleiben ungeprüft.':
      'Nudeln, Brötchen und andere Speisen sind Ideen, keine bestätigte Veranstalterliste.'}
     {' '}Essen ersetzt kein eingeplantes Gel, solange die KH-Menge nicht abgeglichen ist.</p>}
    {view.meal.availabilityNote&&<p className="rrf-meal-guidance">
     {view.meal.availabilityNote}</p>}
    {view.nextAid&&<span className="rrf-meal-aid-status">Streckenversorgung eingeplant</span>}
   </div>}

  {view.completed>0&&<details className="rrf-fuel-check">
   <summary>
    <Icon name="check-circle"/>
    Verpflegung nach Runde {view.completed} notieren
    {feedback&&<span className={'rrf-fuel-check-status is-'+feedback.status}>
     {feedback.status==='planned'?'Wie geplant':
      feedback.status==='different'?'Anders':'Ausgelassen'}</span>}
   </summary>
   <p>Optional. Nur bestätigen, was du wirklich genommen hast.
    Kein automatisches Nachrechnen von KH bei unbekannten Portionsgrößen.</p>
   <div className="rrf-fuel-check-actions" aria-label="Verpflegung manuell dokumentieren">
    <button type="button" disabled={!loaded} aria-pressed={feedback?.status==='planned'}
     onClick={()=>onFuelMark(view.completed,'planned')}>Wie geplant</button>
    <button type="button" disabled={!loaded} aria-pressed={feedback?.status==='different'}
     onClick={()=>onFuelMark(view.completed,'different')}>Etwas anderes</button>
    <button type="button" disabled={!loaded} aria-pressed={feedback?.status==='skipped'}
     onClick={()=>onFuelMark(view.completed,'skipped')}>Ausgelassen</button>
    {feedback&&<button type="button" disabled={!loaded} className="rrf-fuel-check-clear"
     onClick={()=>onFuelMark(view.completed,null)}>Eintrag löschen</button>}
   </div>
  </details>}
  {feedback&&feedback.status!=='planned'&&<p className="rrf-fuel-feedback" role="status">
   <Icon name="info"/>{feedback.text}</p>}
  <details className="rrf-footer"><summary>Hinweise zur Runden-Erfassung</summary>
   <p>Die Runden werden nach deinem Tipp lokal gesichert.
    Keine Garmin- oder Zeitnahme-Verbindung. Bei Verbindungsproblemen die bereits
    geöffnete App offen halten: Ein vollständiger Neustart ohne Internet ist wegen
    der sicheren Anmeldung nicht garantiert. Crew-Details bleiben eingeklappt.</p>
  </details>
 </section>
}

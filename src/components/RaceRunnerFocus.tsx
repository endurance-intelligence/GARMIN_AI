import {useEffect,useMemo,useState} from 'react'
import type {CoachGoal} from '../lib/coachGoal'
import type {RaceCheckpoint} from '../lib/raceExecution.mjs'
import type {GelPlanEvent} from '../lib/gelTiming.mjs'
import {buildRunnerFocus} from '../lib/raceRunnerFocus.mjs'
import {raceElapsedNow} from '../lib/raceDayCockpit.mjs'
import {Icon} from './Icon'
import '../styles/race-runner-focus.css'

/** Athlete-facing view: deliberately no mileage, pace, ETA, split deltas or time budget. */
export function RaceRunnerFocus({active,goal,checkpoints,completed,fuelSchedule,
 startTime,loaded,onComplete,onUndo}:{
 active:boolean;goal:CoachGoal;checkpoints:RaceCheckpoint[];completed:number;
 fuelSchedule:GelPlanEvent[]|null;startTime:string;loaded:boolean;
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
 const view=buildRunnerFocus({checkpoints,completed,gelEvents:fuelSchedule,elapsedMinutes:elapsed})
 if(!active||!view.total)return null
 const gel=view.gel
 return <section className="rrf-root" aria-label="Runner Mode: nächste Runde und Versorgung">
  <header className="rrf-head">
   <span><Icon name="flag"/> RUNNER MODE</span>
   <small>Nur die nächste Runde zählt.</small>
  </header>
  <div className="rrf-center" aria-live="polite" aria-atomic="true">
   <span className="rrf-eyebrow">{view.finished?'RUNDEN ALS GESCHAFFT MARKIERT':'DEINE NÄCHSTE RUNDE'}</span>
   <strong className="rrf-round">{view.finished?'Geschafft!':'Runde '+view.nextIndex+' von '+view.total}</strong>
   <span className="rrf-remaining">{view.finished?'Du hast alle Abschnitte bestätigt.':
    'Noch '+view.remaining+' '+(view.remaining===1?'Runde':'Runden')}</span>
  </div>
  {!view.finished&&<div className={'rrf-break'+(view.longPause?' is-long':'')}>
   <Icon name={view.longPause?'flag':'check'}/>
   <span>{view.breakNote}</span>
  </div>}
  {!view.finished&&<div className="rrf-fuel" aria-label="Verpflegung aus deinem Plan">
   <div className="rrf-fuel-item">
    <Icon name="droplets"/>
    <div><small>TRINKEN</small><strong>{view.drinkDue?'Jetzt trinken':'Trinken nach Durst und Plan'}</strong>
     <span>Versorgung regelmäßig prüfen, ohne dich zu hetzen.</span></div>
   </div>
   <div className="rrf-fuel-item">
    <Icon name="check"/>
    <div><small>GEL BUDDY · {view.gelTiming==='due'?'JETZT LAUT PLAN':'GEPLANT'}</small>
     <strong>{gel?(view.gelTiming==='due'?'Jetzt Gel: ':'Nächstes Gel: ')+gel.brand+' · '+gel.name:
      view.gelTiming==='loading'?'Dein Gel-Plan wird geladen':
      'Keine weitere Gel-Portion eingeplant'}</strong>
     <span>{gel?'Eine Erinnerung aus deinem Vorrat – Einnahme nicht automatisch bestätigt.':
      'Dein Vorrat und deine Produktauswahl bestimmen den Plan.'}</span></div>
   </div>
  </div>}
  {!view.finished&&view.gelTiming!=='due'&&view.timingSource==='approximate'&&
   <p className="rrf-caveat">Die Gel-Empfehlung orientiert sich am geplanten Rundenablauf.
    Ohne bestätigte Startuhrzeit ist sie keine zeitgenaue Erinnerung.</p>}
  <div className="rrf-actions">
   {!view.finished?<button type="button" className="rrf-done" disabled={!loaded}
    onClick={onComplete}><Icon name="check"/> Runde geschafft</button>:
    <p className="rrf-finished">Du musst hier nichts weiter erfassen. Gut gemacht!</p>}
   {view.completed>0&&<button type="button" className="rrf-undo" disabled={!loaded}
    onClick={onUndo}>Letzte Runde korrigieren</button>}
  </div>
  <p className="rrf-footer">Die Rundenzahl wird von dir bestätigt und nur in diesem Browser gespeichert.
   Keine automatische Garmin- oder Zeitnahme-Verbindung. Die ausführlichen Rennzeiten
   findest du ausschließlich im Crew-Bereich.</p>
 </section>
}

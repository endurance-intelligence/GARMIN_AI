import {useState} from 'react'
import type {TrainerWorkout,TrainerStep,WorkoutEndMode} from '../lib/workoutLibrary'
import {makeTrackLapGuide,splitClock} from '../lib/trackLapGuide'
import {applyFinishPreset,toWorkoutTransferDraft,workoutTransferInstructions} from '../lib/workoutStepControls'
import '../styles/workout-finish-selector.css'

type Props={
 workout:TrainerWorkout;groupIndex:number;editable:boolean
 onChange:(fn:(w:TrainerWorkout)=>void)=>void
 onChangeStep:(index:number,fn:(s:TrainerStep)=>TrainerStep)=>void
}
export function WorkoutFinishSelector({workout,groupIndex,editable,onChange,onChangeStep}:Props){
 const [copyMessage,setCopyMessage]=useState('')
 const group=workout.groups[groupIndex]
 if(!group)return null
 const cues=makeTrackLapGuide(workout,group.name)
 const draft=toWorkoutTransferDraft(workout,group.name)
 function setMode(index:number,mode:WorkoutEndMode){
  if(index===1){onChange(w=>{w.warmup.endMode=mode});return}
  if(index===cues.length){onChange(w=>{w.cooldown.endMode=mode});return}
  onChangeStep(index-2,s=>({...s,endMode:mode}))
 }
 async function copyInstructions(){
  try{
   await navigator.clipboard.writeText(workoutTransferInstructions(workout,group.name))
   setCopyMessage('Garmin-Schrittfolge kopiert.')
  }catch{setCopyMessage('Kopieren nicht möglich – bitte Browserfreigabe prüfen.')}
 }
 return <section className="wf-panel" aria-label="Workout-Steuerung für Bahn und Straße">
  <div className="wf-head">
   <div>
    <span className="wf-kicker">SCHRITTSTEUERUNG</span>
    <h4>LAP oder Distanz?</h4>
    <p>Du bestimmst pro Abschnitt, wann die Uhr weiterschalten soll.</p>
   </div>
   <span className="wf-count">{cues.length} Schritte</span>
  </div>
  {editable&&<div className="wf-presets" role="group" aria-label="Voreinstellung für diese Gruppe">
    <button type="button" onClick={()=>onChange(w=>{applyFinishPreset(w,groupIndex,'lap')})}>
     <strong>Bahn</strong><small>Alle Schritte per LAP</small>
    </button>
    <button type="button" onClick={()=>onChange(w=>{applyFinishPreset(w,groupIndex,'distance')})}>
     <strong>Straße</strong><small>Automatisch nach Metern</small>
    </button>
   </div>}
  <p className="wf-explainer">
   LAP = erst an der echten Markierung weiter.
   Distanz = automatische Umschaltung nach den eingetragenen Metern.
   Abschnitte ohne Distanz bleiben bei der Straßen-Voreinstellung auf LAP.
  </p>
  <div className="wf-steps">
   {cues.map(cue=><div className="wf-step" key={cue.index}>
    <div className="wf-step-index">{String(cue.index).padStart(2,'0')}</div>
    <div className="wf-step-description">
     <strong>{cue.type==='run'?'Intervall '+cue.repeat+'/'+cue.repeats:
      cue.type==='recovery'?'Trabpause':
      cue.type==='warmup'?'Einlaufen':
      cue.type==='cooldown'?'Auslaufen':'Übung'}</strong>
     <small>{cue.type==='run'?'Satz '+cue.block+'/'+cue.blocks+' · ':''}
      {cue.distanceMeters!==null?cue.distanceMeters+' m':'ohne feste Distanz'}
      {cue.paceLabel?' · '+cue.paceLabel+'/km':''}
     </small>
     {cue.type==='run'&&cue.expectedSeconds!==null&&<small className="wf-split">
      400 m: {splitClock(cue.fourHundredSeconds)} · Gesamt: {splitClock(cue.expectedSeconds)}
     </small>}
    </div>
    <div className="wf-step-mode">
     {editable&&cue.type!=='drill'?<label>
      <span>Ende</span>
      <select aria-label={'Schritt '+cue.index+' beenden mit'}
       value={cue.end}
       onChange={event=>setMode(cue.index,event.target.value as WorkoutEndMode)}>
       <option value="lap">LAP-Taste</option>
       <option value="distance" disabled={cue.distanceMeters===null}>Distanz</option>
      </select>
     </label>:<span className="wf-mode-readonly">
      {cue.end==='lap'?'LAP-Taste':cue.distanceMeters+' m automatisch'}
     </span>}
    </div>
   </div>)}
  </div>
  {!draft.canFitGarmin&&<p className="wf-warning" role="status">
   Garmin Connect erlaubt höchstens 50 Schritte pro Workout. Diese
   Einheit enthält {cues.length} und müsste für Garmin aufgeteilt werden.
  </p>}
  {draft.invalidDistanceSteps.length>0&&<p className="wf-warning" role="status">
   Distanz fehlt bei Schritt {draft.invalidDistanceSteps.join(', ')}.
  </p>}
  <div className="wf-footer">
   <p>Noch kein Garmin-Upload. Du kannst die genaue Schrittfolge
    zum manuellen Anlegen in Garmin Connect kopieren. Änderungen werden
    erst beim Archivieren als neue Vorlage gespeichert.</p>
   <button type="button" onClick={()=>void copyInstructions()}>Garmin-Schritte kopieren</button>
  </div>
  {copyMessage&&<p className="wf-copy-status" role="status">{copyMessage}</p>}
 </section>
}

import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {ArchiveRecord,TrainerWorkout,TrainerGroup,TrainerStep,WorkoutStepKind} from '../lib/workoutLibrary'
import {blankStep,formatPace,parsePace,workoutSummary} from '../lib/workoutLibrary'
import {makeTrackLapGuide,splitClock} from '../lib/trackLapGuide'
import '../styles/workout-review-dialog.css'

const integer=(s:string)=>s.trim()===''?null:Number(s)
type Pane='overview'|'edit'|'track'
type Props={
 open:boolean;busy:boolean;localBusy:boolean;ocrProgress:string
 editing:TrainerWorkout|null;preview:ArchiveRecord|null
 groupIndex:number;onGroup:(index:number)=>void
 onClose:()=>void;onChange:(fn:(w:TrainerWorkout)=>void)=>void
 onChangeGroup:(fn:(g:TrainerGroup)=>void)=>void
 onChangeStep:(index:number,fn:(s:TrainerStep)=>TrainerStep)=>void
 onSave:()=>void;onCopy:()=>void;onPlan:()=>void
 date:string;error:string;success:string
 ocrRaw:string;ocrWarnings:string[];ocrIdentifiedGroups:number;ocrWasTemplate:boolean
 referenceConfirmed:boolean;onReferenceConfirm:(value:boolean)=>void
 onUseReference:()=>void;onManual:()=>void
 photoUrl:string|null
}
const shortDistance=(meters:number|null)=>
 meters===null?'Distanz offen':meters+' m'
function paceText(step:TrainerStep){
 return step.paceSecondsPerKm!==null?formatPace(step.paceSecondsPerKm)+'/km':'Tempo offen'
}
export function WorkoutReviewDialog(props:Props){
 const {
  open,busy,localBusy,ocrProgress,editing,preview,groupIndex,onGroup,
  onClose,onChange,onChangeGroup,onChangeStep,onSave,onCopy,onPlan,date,
  error,success,ocrRaw,ocrWarnings,ocrIdentifiedGroups,ocrWasTemplate,
  referenceConfirmed,onReferenceConfirm,onUseReference,onManual,photoUrl
 }=props
 const [pane,setPane]=useState<Pane>('overview')
 const [photoShown,setPhotoShown]=useState(false)
 const [rawShown,setRawShown]=useState(false)
 const [approved,setApproved]=useState(false)
 const closeButton=useRef<HTMLButtonElement>(null)
 const dialog=useRef<HTMLDivElement>(null)
 useEffect(()=>{
  if(!open)return
  const prior=document.body.style.overflow
  const focusBefore=document.activeElement instanceof HTMLElement?document.activeElement:null
  document.body.style.overflow='hidden'
  const focus=requestAnimationFrame(()=>closeButton.current?.focus())
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busy&&!localBusy){event.preventDefault();onClose()}
   if(event.key!=='Tab'||!dialog.current)return
   const focusable=[...dialog.current.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
   )].filter(el=>el.getClientRects().length>0)
   if(focusable.length===0)return
   const first=focusable[0],last=focusable[focusable.length-1]
   if(event.shiftKey&&document.activeElement===first){
    event.preventDefault();last.focus()
   }else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();first.focus()
   }
  }
  document.addEventListener('keydown',onKey)
  return ()=>{
   cancelAnimationFrame(focus)
   document.body.style.overflow=prior
   document.removeEventListener('keydown',onKey)
   focusBefore?.focus()
  }
 },[open,busy,localBusy,onClose])
 useEffect(()=>{if(!open){setPane('overview');setPhotoShown(false);setRawShown(false);setApproved(false)}},[open])
 if(!open)return null
 const workout=editing??preview?.workout??null
 const group=workout?.groups[groupIndex]??null
 const summary=group?workoutSummary(group):null
 const runSteps=group?.steps.filter(x=>x.kind==='run')??[]
 const recovering=group?.steps.filter(x=>x.kind==='recovery').length??0
 const cues=workout&&group?makeTrackLapGuide(workout,group.name):[]
 const runningCues=cues.filter(x=>x.type==='run')
 const availableGroups=workout?.groups.length??0
 const headline=editing?'Training prüfen':preview?'Training aus dem Archiv':'Trainingsfoto auslesen'
 const canUseReference=!!photoUrl&&!!ocrRaw&&!ocrWasTemplate
 return createPortal(<div className="wr-backdrop"
   onPointerDown={event=>{
    if(event.target===event.currentTarget&&!busy&&!localBusy)onClose()
   }}>
  <div className="wr-modal" role="dialog" aria-modal="true" aria-label="Trainertraining prüfen"
   ref={dialog}>
   <header className="wr-header">
    <div className="wr-header-title">
     <span className="wr-eyebrow">GARMIN_AI · TRAININGSBIBLIOTHEK</span>
     <h2>{headline}</h2>
     <p>Ein Fenster. Alle Gruppen. Erst prüfen, dann speichern.</p>
    </div>
    <button type="button" className="wr-close" ref={closeButton}
     disabled={busy||localBusy} aria-label="Trainingsfenster schließen" onClick={onClose}>×</button>
   </header>
   <div className="wr-scroll">
    {localBusy&&<div role="status" className="wr-info">
     <strong>Foto wird auf deinem Gerät gelesen</strong>
     <p>{ocrProgress||'Erkannte Trainingsdaten werden vorbereitet …'}</p>
    </div>}
    {photoUrl&&<div className="wr-photo-row">
     <span>Originalfoto zum Vergleichen</span>
     <button type="button" aria-pressed={photoShown}
      onClick={()=>setPhotoShown(v=>!v)}>{photoShown?'Foto ausblenden':'Foto anzeigen'}</button>
    </div>}
    {photoShown&&photoUrl&&<img className="wr-original" src={photoUrl}
      alt="Originales Trainerfoto für den Vergleich mit den erkannten Trainingsdaten"/>}
    {!!ocrRaw&&<div className="wr-ocr-info">
     <div className="wr-ocr-head">
      <span>{ocrWasTemplate?'Geprüfte ORC-Referenz übernommen':
       'Lokale Texterkennung: '+ocrIdentifiedGroups+' Gruppe(n) erkannt'}</span>
      <button type="button" onClick={()=>setRawShown(v=>!v)} aria-pressed={rawShown}>
       {rawShown?'OCR-Text ausblenden':'Erkannten Text ansehen'}
      </button>
     </div>
     {rawShown&&<pre className="wr-ocr-text">{ocrRaw}</pre>}
     {ocrWarnings.length>0&&<p className="wr-warning">{ocrWarnings[0]}</p>}
    </div>}
    {canUseReference&&<div className="wr-reference">
      <strong>Das ist die bekannte ORC-Grafik „Schwelle im Wechsel“?</strong>
      <p>Die lokale Texterkennung liest die Grafik nicht vollständig.
       Für <strong>genau dieses</strong> Training können wir alle fünf Gruppen
       aus der bereits geprüften Originalvorlage laden, statt Paces zu raten.</p>
      <label><input type="checkbox" checked={referenceConfirmed}
       onChange={event=>onReferenceConfirm(event.target.checked)}/>
       Ich bestätige, dass es dieselbe ORC-Grafik ist.</label>
      <button type="button" disabled={!referenceConfirmed||busy||localBusy}
       onClick={()=>{onUseReference();setPane('overview');setApproved(false)}}>
       Alle 5 Gruppen übernehmen
      </button>
     </div>}
    {workout&&group&&<div className="wr-workout">
      <div className="wr-name-row">
       <div>
        <span className="wr-caption">{workout.trainer||'Trainertraining'}</span>
        <h3>{workout.title||'Neues Training'}</h3>
       </div>
       <span className="wr-group-count">{availableGroups} {availableGroups===1?'Gruppe':'Gruppen'}</span>
      </div>
      <div className="wr-select-group">
       <span>Deine Gruppe wählen</span>
       <div className="wr-group-chips" role="group" aria-label="Trainingsgruppe auswählen">
        {workout.groups.map((g,i)=><button type="button" key={i}
         className={groupIndex===i?'selected':''} aria-pressed={groupIndex===i}
         onClick={()=>{onGroup(i);setPane('overview');setApproved(false)}}>
         {g.name||'Gruppe '+(i+1)}</button>)}
       </div>
      </div>
      <div className="wr-switcher" role="group" aria-label="Ansicht">
       <button type="button" className={pane==='overview'?'selected':''}
        aria-pressed={pane==='overview'} onClick={()=>setPane('overview')}>Ablauf</button>
       <button type="button" className={pane==='track'?'selected':''}
        aria-pressed={pane==='track'} onClick={()=>setPane('track')}>Bahn / LAP</button>
       {editing&&<button type="button" className={pane==='edit'?'selected':''}
        aria-pressed={pane==='edit'} onClick={()=>setPane('edit')}>Bearbeiten</button>}
      </div>
      {pane==='overview'&&<>
       <div className="wr-metrics">
        <div><span>Belastungen</span><strong>{summary?.intervals??0}</strong></div>
        <div><span>Belastungsstrecke</span><strong>{summary?.distanceMeters?
         (summary.distanceMeters/1000).toLocaleString('de-DE')+' km':'offen'}</strong></div>
        <div><span>Trabpausen</span><strong>{recovering}</strong></div>
       </div>
       {group.notes&&<p className="wr-group-notes">{group.notes}</p>}
       <div className="wr-intervals">
        {group.steps.map((step,i)=><div key={i}
         className={'wr-interval '+(step.kind==='run'?'wr-interval-run':'')}>
         <span className="wr-interval-index">{String(i+1).padStart(2,'0')}</span>
         <span className="wr-interval-kind">{step.kind==='run'?'Belastung':
          step.kind==='recovery'?'Trabpause':step.kind==='drill'?'Übung':
          step.kind==='warmup'?'Einlaufen':'Auslaufen'}</span>
         <strong>{shortDistance(step.distanceMeters)}</strong>
         <span className="wr-interval-pace">{step.kind==='run'?paceText(step):
           step.durationSeconds?splitClock(step.durationSeconds):'locker'}</span>
        </div>)}
       </div>
       <p className="wr-muted">Einlaufen: {shortDistance(workout.warmup.distanceMeters)}
        {workout.warmup.notes?' · '+workout.warmup.notes:''}
        {' · '}Auslaufen: {workout.cooldown.notes||'nach Gefühl'}</p>
      </>}
      {pane==='track'&&<>
       <p className="wr-muted">Bahn-Vorschau: Du beendest jeden Abschnitt an der echten
        Bahnmarkierung mit LAP. Es wird noch nichts an Garmin übertragen.</p>
       <div className="wr-lap-grid">
        {runningCues.map(cue=><div className="wr-lap-card" key={cue.index}>
         <span>Satz {cue.block}/{cue.blocks} · Intervall {cue.repeat}/{cue.repeats}</span>
         <strong>{shortDistance(cue.distanceMeters)}</strong>
         <b>{cue.paceLabel?cue.paceLabel+'/km':'Tempo prüfen'}</b>
         <small>400-m-Sollzeit: {splitClock(cue.fourHundredSeconds)}
          {' · '}Gesamt: {splitClock(cue.expectedSeconds)}</small>
        </div>)}
       </div>
       <p className="wr-muted">Jede Belastung und Pause endet in dieser Vorschau per LAP.
        Eine Wahl zwischen LAP und GPS-Distanz für einzelne Garmin-Schritte
        wird separat implementiert und geprüft.</p>
      </>}
      {pane==='edit'&&editing&&<>
       <div className="wr-edit-meta">
        <label>Training<input maxLength={120} value={editing.title}
         onChange={e=>onChange(w=>{w.title=e.target.value})}/></label>
        <label>Trainer / Verein<input maxLength={100} value={editing.trainer}
         onChange={e=>onChange(w=>{w.trainer=e.target.value})}/></label>
        <label>Quelle<input maxLength={120} value={editing.sourceLabel}
         onChange={e=>onChange(w=>{w.sourceLabel=e.target.value})}/></label>
       </div>
       <div className="wr-edit-meta wr-edit-segments">
        {(['warmup','cooldown'] as const).map(part=><div key={part}>
         <b>{part==='warmup'?'Einlaufen':'Auslaufen'}</b>
         <label>Meter<input type="number" inputMode="numeric" min={20} max={50000}
          value={editing[part].distanceMeters??''}
          onChange={e=>onChange(w=>{w[part].distanceMeters=integer(e.target.value)})}/></label>
         <label>Notizen<input maxLength={250} value={editing[part].notes}
          onChange={e=>onChange(w=>{w[part].notes=e.target.value})}/></label>
        </div>)}
       </div>
       <div className="wr-edit-meta">
        <label>Name der Gruppe<input maxLength={50} value={group.name}
         onChange={e=>onChangeGroup(g=>{g.name=e.target.value})}/></label>
        <label>Hinweise der Gruppe<input maxLength={350} value={group.notes}
         onChange={e=>onChangeGroup(g=>{g.notes=e.target.value})}/></label>
       </div>
       <div className="wr-edit-steps">
        {group.steps.map((step,i)=><div className="wr-edit-step" key={i}>
         <div className="wr-edit-step-header"><b>Schritt {i+1}</b>
          <button type="button" disabled={group.steps.length<=1}
           onClick={()=>onChangeGroup(g=>{g.steps.splice(i,1)})}>Entfernen</button>
         </div>
         <div className="wr-edit-step-fields">
          <label>Art<select value={step.kind}
           onChange={e=>onChangeStep(i,s=>({...s,kind:e.target.value as WorkoutStepKind}))}>
           <option value="run">Belastung</option>
           <option value="recovery">Trabpause</option>
           <option value="drill">Übung</option>
           <option value="warmup">Einlaufen</option>
           <option value="cooldown">Auslaufen</option>
          </select></label>
          <label>Meter<input type="number" inputMode="numeric" min={20} max={50000}
           value={step.distanceMeters??''}
           onChange={e=>onChangeStep(i,s=>({...s,distanceMeters:integer(e.target.value)}))}/></label>
          <label>Tempo/km<input type="text" inputMode="text"
           key={groupIndex+'-'+i} placeholder="4:20" maxLength={5}
           defaultValue={formatPace(step.paceSecondsPerKm)}
           onBlur={e=>onChangeStep(i,s=>({...s,paceSecondsPerKm:parsePace(e.target.value)}))}/></label>
          <label>Sekunden<input type="number" inputMode="numeric" min={10} max={14400}
           value={step.durationSeconds??''}
           onChange={e=>onChangeStep(i,s=>({...s,durationSeconds:integer(e.target.value)}))}/></label>
          <label>Notizen<input maxLength={180} value={step.notes}
           onChange={e=>onChangeStep(i,s=>({...s,notes:e.target.value}))}/></label>
         </div>
        </div>)}
       </div>
       <div className="wr-edit-actions">
        <button type="button" onClick={()=>onChangeGroup(g=>g.steps.push(blankStep('run')))}>+ Belastung</button>
        <button type="button" onClick={()=>onChangeGroup(g=>g.steps.push(blankStep('recovery')))}>+ Trabpause</button>
        {editing.groups.length<12&&<button type="button"
         onClick={()=>{
          const i=editing.groups.length
          onChange(w=>w.groups.push({name:'Gruppe '+(i+1),notes:'',steps:[blankStep()]}))
          onGroup(i)
         }}>+ Gruppe</button>}
        {editing.groups.length>1&&<button type="button"
         onClick={()=>{
          onChange(w=>w.groups.splice(groupIndex,1))
          onGroup(Math.max(0,groupIndex-1))
         }}>Gruppe entfernen</button>}
       </div>
      </>}
     </div>}
    {!workout&&!localBusy&&<div className="wr-empty">
     <strong>Keine vollständige Intervallgruppe erkannt.</strong>
     <p>Die lokale OCR ist bei Balkengrafiken unzuverlässig.
      Nutze die bereits geprüfte ORC-Vorlage, wenn es genau dieses Bild ist,
      oder übertrage die Werte manuell anhand des Originalfotos.</p>
     <button type="button" onClick={()=>{onManual();setPane('edit')}}>Training manuell erfassen</button>
    </div>}
    {error&&<p className="wr-error" role="alert">{error}</p>}
    {success&&<p className="wr-success" role="status">{success}</p>}
   </div>
   <footer className="wr-footer">
    {editing&&<>
     <label className="wr-confirm"><input type="checkbox" checked={approved}
      onChange={event=>setApproved(event.target.checked)}/>
      Ich habe die Trainerangaben und alle Gruppen geprüft.</label>
     <button type="button" className="wr-save" disabled={busy||localBusy||!approved}
      onClick={onSave}>{busy?'Speichern …':'Geprüfte Vorlage archivieren'}</button>
    </>}
    {preview&&<>
     <button type="button" onClick={onCopy}>Als neue Version bearbeiten</button>
     <button type="button" className="wr-save" disabled={busy} onClick={onPlan}>
      Für {date.split('-').reverse().join('.')} vormerken</button>
    </>}
    {!editing&&!preview&&<span className="wr-footer-muted">Noch keine Vorlage zum Speichern bereit.</span>}
   </footer>
  </div>
 </div>,document.body)
}

import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {SyncCenter} from '../components/SyncCenter'
import {CoachTodayWeather} from '../components/CoachTodayWeather'
import {CoachGlance} from '../components/CoachGlance'
import {WeeklyTrainingOptions,berlinToday,mondayOf} from '../components/WeeklyTrainingOptions'
import {coachAddDays} from '../lib/coachSevenDay.mjs'
import {CrossTrainingCoachCard} from '../components/CrossTrainingCoachCard'
import {CoachGoalPanel} from '../components/CoachGoalPanel'
import {CoachSevenDay} from '../components/CoachSevenDay'
import {CoachEvidenceSummary} from '../components/CoachEvidenceSummary'
import '../styles/coach-glance.css'
import type {Page} from '../navigation'

export function CoachPage({active,onGo,onOpenCalendar,onOpenRaceWeather}: {active:boolean; onGo:(page:Page)=>void;onOpenCalendar:(date?:string)=>void;onOpenRaceWeather:()=>void}) {
  const [weightOpen,setWeightOpen]=useState(false)
  const [savedWeight,setSavedWeight]=useState<number|null>(null)
  const closeRef=useRef<HTMLButtonElement|null>(null)
  useEffect(()=>{
    if(!weightOpen)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const focus=requestAnimationFrame(()=>closeRef.current?.focus())
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setWeightOpen(false)}
    }
    window.addEventListener('keydown',onKey)
    return ()=>{
      cancelAnimationFrame(focus)
      document.body.style.overflow=previous
      window.removeEventListener('keydown',onKey)
    }
  },[weightOpen])

  return (
<section className={active?'page active co-home':'page co-home'}>
 <header className="co-header">
  <div className="co-header-left">
   <span className="co-eyebrow">GARMIN_AI / COACH</span>
   <h1>Dein Tag im Blick.</h1>
   <p>Training, Wetter und Erholung. Ohne unnötige Zahlen.</p>
  </div>
  <button type="button" className="co-weight-action" aria-haspopup="dialog"
   onClick={()=>setWeightOpen(true)} title="Gewicht hinzufügen">
   <span className="co-plus" aria-hidden="true">+</span> Gewicht
  </button>
 </header>
 {savedWeight!==null&&<p role="status" className="co-saved-note">
  {savedWeight.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})} kg gespeichert · Garmin-Übertragung noch ausstehend
 </p>}
 <CoachGoalPanel active={active} compact onEdit={()=>onGo('race')} onForecastOpen={onOpenRaceWeather}/>
 <CoachGlance active={active} onCalendar={()=>onOpenCalendar()}>
  <CoachTodayWeather active={active}/>
 </CoachGlance>
 <CoachSevenDay active={active} onCalendar={onOpenCalendar}/>
 <div className="co-week-review">
  <div className="co-week-title"><strong>Letzte abgeschlossene Woche</strong>
   <small>Montag bis Sonntag · kein Vergleich mit einer angefangenen Woche</small></div>
  <CoachEvidenceSummary active={active} mode="weekly"
   weekStart={coachAddDays(mondayOf(berlinToday()),-7)}/>
 </div>
 <div className="co-extras">
  <details className="co-extra-fold">
   <summary>Feste Trainingsangebote und Teilnahme</summary>
   <WeeklyTrainingOptions active={active} weekStart={mondayOf(berlinToday())} compact/>
  </details>
  <details className="co-extra-fold">
   <summary>Stabi, Fußball & ergänzender Sport</summary>
   <CrossTrainingCoachCard active={active} onOpen={()=>onGo('strength')}/>
  </details>
 </div>
 {weightOpen&&createPortal(<div className="co-dialog-backdrop"
   onPointerDown={event=>{if(event.currentTarget===event.target)setWeightOpen(false)}}>
   <div className="co-dialog" role="dialog" aria-modal="true" aria-label="Gewicht speichern">
    <div className="co-dialog-head"><strong>Gewicht eintragen</strong>
     <button type="button" className="co-dialog-close" ref={closeRef}
      aria-label="Gewichtsfenster schließen" onClick={()=>setWeightOpen(false)}>×</button>
    </div>
    <SyncCenter active={active&&weightOpen} mode="weight" inlineWheel onSaved={kg=>{
      setSavedWeight(kg);setWeightOpen(false)
    }}/>
   </div>
  </div>,document.body)}
 </section>
  )
}

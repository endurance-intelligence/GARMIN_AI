import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {SyncCenter} from '../components/SyncCenter'
import {CoachTodayWeather} from '../components/CoachTodayWeather'
import {CoachGlance} from '../components/CoachGlance'
import {CoachHealthStatus} from '../components/CoachHealthStatus'
import {berlinToday,mondayOf} from '../components/WeeklyTrainingOptions'
import {CrossTrainingCoachCard} from '../components/CrossTrainingCoachCard'
import {CoachGoalPanel} from '../components/CoachGoalPanel'
import {CoachSevenDay} from '../components/CoachSevenDay'
import {CoachSessionBridge} from '../components/CoachSessionBridge'
import {CoachEvidenceSummary} from '../components/CoachEvidenceSummary'
import {coachAddDays} from '../lib/coachSevenDay.mjs'
import {garminSupabase} from '../lib/garminSupabase'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import '../styles/coach-glance.css'
import type {Page} from '../navigation'

export function CoachPage({active,focus,onGo,onOpenCalendar,onOpenRaceWeather,onOpenSession}: {
 active:boolean;focus?:{date:string;token:number}|null;
 onGo:(page:Page)=>void;onOpenCalendar:(date?:string)=>void;onOpenRaceWeather:()=>void;
 onOpenSession:(activityId:string)=>void
}) {
  const [weightOpen,setWeightOpen]=useState(false)
  const [savedWeight,setSavedWeight]=useState<number|null>(null)
  const [savedWeightDelivery,setSavedWeightDelivery]=useState<'not_published'|'confirmed'|'needs_review'>('not_published')
  const [sharedSnapshot,setSharedSnapshot]=useState<CoachSnapshot|null>(null)
  const [snapshotError,setSnapshotError]=useState(false)
  const [snapshotLoading,setSnapshotLoading]=useState(true)
  const [snapshotVersion,setSnapshotVersion]=useState(0)
 const [showWeeklyReview,setShowWeeklyReview]=useState(false)
  useEffect(()=>{
   const update=()=>setSnapshotVersion(v=>v+1)
   window.addEventListener('garmin-ai-weekly-choice-changed',update)
   window.addEventListener('garmin-ai-coach-changed',update)
   return ()=>{
    window.removeEventListener('garmin-ai-weekly-choice-changed',update)
    window.removeEventListener('garmin-ai-coach-changed',update)
   }
  },[])
  useEffect(()=>{
   if(!active||!garminSupabase)return
   const abort=new AbortController()
   let mounted=true
   setSnapshotLoading(true)
   void garminSupabase.auth.getSession().then(({data:{session}})=>{
    if(!session)throw Error('Login required')
    return loadCoachSnapshot(session,berlinToday(),abort.signal)
   }).then(next=>{if(mounted&&next){setSharedSnapshot(next);setSnapshotError(false)}})
    .catch(err=>{if(mounted&&err?.name!=='AbortError')setSnapshotError(true)})
    .finally(()=>{if(mounted)setSnapshotLoading(false)})
   return ()=>{mounted=false;abort.abort()}
  },[active,snapshotVersion])
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
  <div className="co-header-actions">
   <CoachHealthStatus active={active} life={sharedSnapshot?.life}
    onChanged={()=>window.dispatchEvent(new Event('garmin-ai-coach-changed'))}/>
   <button type="button" className="co-weight-action" aria-haspopup="dialog"
    onClick={()=>setWeightOpen(true)} title="Gewicht hinzufügen">
    <span className="co-plus" aria-hidden="true">+</span> Gewicht
   </button>
  </div>
 </header>
 {savedWeight!==null&&<p role="status" className="co-saved-note">
  {savedWeight.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})} kg gespeichert ·
  {savedWeightDelivery==='confirmed'?' Intervals.icu bestätigt, nicht Garmin Connect':
   savedWeightDelivery==='needs_review'?' Intervals.icu-Übertragung prüfen':' nur in GARMIN_AI gespeichert'}
  
 </p>}
 <CoachGoalPanel active={active} compact onEdit={()=>onGo('goals')} onForecastOpen={onOpenRaceWeather}/>
 {snapshotLoading&&!sharedSnapshot&&!snapshotError&&<p className="co-data-note" role="status">
  Lade deine Garmin-, Kalender- und Coach-Daten gemeinsam …</p>}
 {snapshotError&&<p className="co-data-note" role="status">
  Gemeinsamer Coach-Snapshot nicht vollständig erreichbar. Die einzelnen Bereiche prüfen ihre Daten separat.</p>}
 {(!snapshotLoading||sharedSnapshot||snapshotError)&&<>
  <CoachGlance active={active} onCalendar={()=>onOpenCalendar()} sharedSnapshot={sharedSnapshot}>
   <CoachTodayWeather active={active}/>
  </CoachGlance>
  {sharedSnapshot&&<CoachSessionBridge snapshot={sharedSnapshot} today={berlinToday()}
   onOpenSession={onOpenSession}/>}
  <CoachSevenDay active={active} focus={focus} onCalendar={onOpenCalendar} sharedSnapshot={sharedSnapshot}/>
 </>}
 <details className="co-extra-tools" onToggle={event=>setShowWeeklyReview(event.currentTarget.open)}>
   <summary>Weitere Garmin-Analyse &amp; Gruppentermine <span>Bei Bedarf</span></summary>
   {showWeeklyReview&&<CoachEvidenceSummary active={active&&showWeeklyReview}
    mode="weekly" weekStart={coachAddDays(mondayOf(berlinToday()),-7)}/>}
   <div className="co-extra-actions">
    <button type="button" onClick={()=>onOpenCalendar()}>
     <span>Gruppentermine und Wochenplanung im Kalender</span> <span aria-hidden="true">↗</span>
    </button>
    <CrossTrainingCoachCard active={active&&showWeeklyReview} onOpen={()=>onGo('strength')}/>
   </div>
  </details>
 {weightOpen&&createPortal(<div className="co-dialog-backdrop"
   onPointerDown={event=>{if(event.currentTarget===event.target)setWeightOpen(false)}}>
   <div className="co-dialog" role="dialog" aria-modal="true" aria-label="Gewicht speichern">
    <div className="co-dialog-head"><strong>Gewicht eintragen</strong>
     <button type="button" className="co-dialog-close" ref={closeRef}
      aria-label="Gewichtsfenster schließen" onClick={()=>setWeightOpen(false)}>×</button>
    </div>
    <SyncCenter active={active&&weightOpen} mode="weight" inlineWheel onSaved={(kg,status,deliveryAttemptFailed)=>{
      setSavedWeight(kg);setSavedWeightDelivery(status)
      // Keep the dialog visible on failed remote delivery so the error is readable.
      if(!deliveryAttemptFailed)setWeightOpen(false)
    }}/>
   </div>
  </div>,document.body)}
 </section>
  )
}

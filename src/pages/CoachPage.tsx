import {useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Icon} from '../components/Icon'
import {HealthCoachContextCard} from '../components/HealthCoachContextCard'
import {WeighReminder} from '../components/WeighReminder'
import {SyncCenter} from '../components/SyncCenter'
import {CoachTodayWeather} from '../components/CoachTodayWeather'
import {CoachGlance} from '../components/CoachGlance'
import {CoachHealthStatus} from '../components/CoachHealthStatus'
import {berlinToday} from '../components/WeeklyTrainingOptions'
import {ArchivedWeekLearningCard} from '../components/ArchivedWeekLearningCard'
import {showArchivedLearning} from '../lib/learningVisibility.mjs'
import {TrainingWeekArchive} from '../components/TrainingWeekArchive'
import {makePlanSnapshot} from '../lib/trainingHistory.mjs'
import {CoachDailyBrief} from '../components/CoachDailyBrief'
import {trainingAlternativeForDate} from '../lib/goalTrainingFocus.mjs'
import {AskCoachCard} from '../components/AskCoachCard'
import {buildSevenDayCoach} from '../lib/coachSevenDay.mjs'
import {coachMood} from '../lib/coachPersonality.mjs'
import {buildCoachDailyBrief} from '../lib/coachDailyBrief.mjs'
import {garminSupabase} from '../lib/garminSupabase'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import '../styles/coach-glance.css'
import '../styles/coach-roadmap.css'
import type {Page} from '../navigation'

export function CoachPage({active,onGo,onOpenCalendar,onOpenDecision}: {
 active:boolean;onGo:(page:Page)=>void;onOpenCalendar:(date?:string)=>void;onOpenDecision:(date:string)=>void
}) {
  const [weightOpen,setWeightOpen]=useState(false)
  const [healthOpenToken,setHealthOpenToken]=useState(0)
  const [savedWeight,setSavedWeight]=useState<number|null>(null)
  const [savedWeightDelivery,setSavedWeightDelivery]=useState<'not_published'|'confirmed'|'needs_review'>('not_published')
  const [sharedSnapshot,setSharedSnapshot]=useState<CoachSnapshot|null>(null)
  const [snapshotError,setSnapshotError]=useState(false)
  const [snapshotLoading,setSnapshotLoading]=useState(true)
  const [snapshotVersion,setSnapshotVersion]=useState(0)
 const [weatherAnswer,setWeatherAnswer]=useState<{date:string;text:string}|null>(null)
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
    return loadCoachSnapshot(session,berlinToday(),abort.signal,undefined,4)
   }).then(next=>{if(mounted&&next){setSharedSnapshot(next);setSnapshotError(false)}})
    .catch(err=>{if(mounted&&err?.name!=='AbortError')setSnapshotError(true)})
    .finally(()=>{if(mounted)setSnapshotLoading(false)})
   return ()=>{mounted=false;abort.abort()}
  },[active,snapshotVersion])
  const coachToday=berlinToday()
  const dailyPlan=useMemo(()=>sharedSnapshot?buildSevenDayCoach({
   today:coachToday,health:sharedSnapshot.health,options:sharedSnapshot.options,
   boards:sharedSnapshot.boards,plans:sharedSnapshot.plans,goal:sharedSnapshot.goal,
   life:sharedSnapshot.life,racePortfolio:sharedSnapshot.racePortfolio,goalRoute:sharedSnapshot.goalRoute
  }):null,[sharedSnapshot,coachToday])
  const currentBudget=dailyPlan?.weeklyBudgets?.find(w=>w.current)
  const archiveSnapshot=currentBudget&&dailyPlan&&sharedSnapshot?makePlanSnapshot({budget:currentBudget,days:dailyPlan.days,plans:sharedSnapshot.plans.entries,options:sharedSnapshot.options.options,choices:sharedSnapshot.options.choices,today:coachToday,goalName:dailyPlan.goalProfile?.name??null}):null
  const dailyBrief=useMemo(()=>dailyPlan&&sharedSnapshot?
   buildCoachDailyBrief({today:coachToday,plan:dailyPlan,health:sharedSnapshot.health}):null,
   [dailyPlan,sharedSnapshot,coachToday])
  const openCoachDecision=()=>onOpenDecision(coachToday)
  const openAskCoach=()=>{const el=document.getElementById('coach-ask');el?.scrollIntoView({behavior:'smooth',block:'start'});el?.querySelector<HTMLButtonElement>('.ask-questions button')?.focus({preventScroll:true})}
  const openProgressHistory=()=>{onGo('training');window.dispatchEvent(new Event('garmin-ai-open-training-development'))}
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
   <h1>Dein Coach</h1>
   <p>I fall. I rise. I show up. I improve.</p>
  </div>
  <div className="co-header-actions">
   <button type="button" className="co-ask-action" disabled={!dailyPlan||snapshotLoading||snapshotError} onClick={openAskCoach}><Icon name="message-circle"/> Coach fragen</button>
   <CoachHealthStatus active={active} openToken={healthOpenToken} life={sharedSnapshot?.life}
    onChanged={()=>window.dispatchEvent(new Event('garmin-ai-coach-changed'))}/>
   <button type="button" className="co-weight-action" aria-haspopup="dialog"
    onClick={()=>setWeightOpen(true)} title="Gewicht hinzufügen">
    <span className="co-plus" aria-hidden="true">+</span> Gewicht
   </button>
  </div>
 </header>
 <WeighReminder active={active} today={coachToday} onWeigh={()=>setWeightOpen(true)}/>
 {savedWeight!==null&&<p role="status" className="co-saved-note">
  {savedWeight.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})} kg gespeichert ·
  {savedWeightDelivery==='confirmed'?' Intervals.icu bestätigt, nicht Garmin Connect':
   savedWeightDelivery==='needs_review'?' Intervals.icu-Übertragung prüfen':' nur in GARMIN_AI gespeichert'}
  
 </p>}
 {dailyBrief&&!snapshotLoading&&!snapshotError&&<CoachDailyBrief brief={dailyBrief}
  mood={coachMood(dailyPlan,coachToday)} onDecision={openCoachDecision} supplement={trainingAlternativeForDate(dailyPlan,coachToday)||(dailyPlan?.supplement?.suggestion?.date===coachToday&&dailyPlan.supplement.suggestion.mode==='existing-slot'?dailyPlan.supplement.suggestion:null)}
  onReportSymptoms={()=>setHealthOpenToken(n=>n+1)}
  weather={<CoachTodayWeather active={active} snapshot={sharedSnapshot!} plan={dailyPlan!} onReport={setWeatherAnswer}/>}/>}


 <HealthCoachContextCard active={active&&!snapshotLoading&&!snapshotError} today={coachToday} health={sharedSnapshot?.health.metrics} onHealth={()=>onGo('health')}/>
 {dailyPlan?.archivedLearning&&!snapshotLoading&&!snapshotError&&showArchivedLearning(dailyPlan.archivedLearning,sharedSnapshot?.health.metrics,sharedSnapshot?.boards,coachToday)&&<ArchivedWeekLearningCard review={dailyPlan.archivedLearning}/>}
 {archiveSnapshot&&!snapshotLoading&&!snapshotError&&<TrainingWeekArchive key={archiveSnapshot.weekStart} active={active} snapshot={archiveSnapshot} compact onHistory={()=>{onGo('training');window.dispatchEvent(new Event('garmin-ai-open-training-history'))}}/>}
 {snapshotLoading&&!sharedSnapshot&&!snapshotError&&<p className="co-data-note" role="status">
  Lade deine Garmin-, Kalender- und Coach-Daten gemeinsam …</p>}
 {snapshotError&&<p className="co-data-note" role="status">
  Gemeinsamer Coach-Snapshot nicht vollständig erreichbar. Die einzelnen Bereiche prüfen ihre Daten separat.</p>}
 {(!snapshotLoading||sharedSnapshot||snapshotError)&&
  <CoachGlance active={active} onCalendar={()=>onOpenCalendar()} sharedSnapshot={snapshotError?null:sharedSnapshot} dailyPlan={snapshotLoading||snapshotError?null:dailyPlan} recoveryOnly compactToday={!!dailyBrief&&!snapshotLoading&&!snapshotError}>
   <span/>
  </CoachGlance>}
 <div id="coach-ask" className="co-chat-space">
 {sharedSnapshot&&dailyPlan&&!snapshotLoading&&!snapshotError&&<AskCoachCard
  active={active} today={coachToday} snapshot={sharedSnapshot} plan={dailyPlan} weather={weatherAnswer}
  onDecision={openCoachDecision} onProgress={openProgressHistory}
  onGoals={()=>onGo('goals')} onSymptoms={()=>setHealthOpenToken(n=>n+1)}/>}
 </div>
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

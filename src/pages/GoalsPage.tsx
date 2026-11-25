import {useEffect,useState} from 'react'
import {CoachGoalPanel} from '../components/CoachGoalPanel'
import {RaceGoalsPanel} from '../components/RaceGoalsPanel'
import {CoachLongTermPlan} from '../components/CoachLongTermPlan'
import {GoalProgressCard} from '../components/GoalProgressCard'
import {PolarizedMethodCard} from '../components/PolarizedMethodCard'
import {RaceEventResearch} from '../components/RaceEventResearch'
import {Icon} from '../components/Icon'
import {garminSupabase} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {Page} from '../navigation'
import '../styles/goals-page.css'

export function GoalsPage({active,onGo}:{active:boolean;onGo:(page:Page)=>void}){
 const [revision,setRevision]=useState(0)
 const [snapshot,setSnapshot]=useState<CoachSnapshot|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [showEventScout,setShowEventScout]=useState(false)
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setLoading(true);setError('')
  void garminSupabase.auth.getSession().then(({data:{session}})=>{
   if(!session)throw Error('Bitte anmelden.')
   return loadCoachSnapshot(session,berlinDateToday(),controller.signal,undefined,4)
  }).then(value=>{if(mounted)setSnapshot(value)})
   .catch(e=>{if(mounted&&e?.name!=='AbortError')
    setError(e instanceof Error?e.message:'Trainingsziel derzeit nicht verfügbar.')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,revision])
 const changed=()=>{setLoading(true);setRevision(x=>x+1);window.dispatchEvent(new Event('garmin-ai-coach-changed'))}
 return <section className={active?'page active goals-page':'page goals-page'}
  aria-label="Goals und langfristige Trainingsziele">
  <header className="page-intro goals-intro">
   <div><div className="eyebrow">GARMIN_AI / GOALS</div>
    <h1>Meine Ziele</h1>
    <p>Wettkampf oder Fitness erhalten – du bestimmst, worauf der Coach hinarbeitet.</p></div>
   <button type="button" className="goals-race-link" onClick={()=>onGo('race')}>
    <Icon name="flag"/> Race Prep öffnen <Icon name="arrow-up-right"/>
   </button>
  </header>
  <CoachGoalPanel key={'primary-'+revision} active={active} onSaved={changed}/>
  {loading&&<p role="status" className="goals-status">Trainingsfahrplan wird aktualisiert …</p>}
  {error&&<p role="alert" className="goals-status">{error}</p>}
  {snapshot&&!loading&&!error&&<GoalProgressCard today={berlinDateToday()} snapshot={snapshot}
   onRacePrep={()=>onGo('race')}/>}
  {snapshot&&!loading&&!error&&<CoachLongTermPlan today={berlinDateToday()} snapshot={snapshot}/>}
  <RaceGoalsPanel key={'portfolio-'+revision} active={active} onPrimaryChange={changed}/>
  <details className="goals-event-scout goals-method"><summary><span><strong>Trainingsmethode</strong>
   <small>Polarisiertes Training · Grundlagen und Intensität</small></span><Icon name="chevron-down"/></summary>
   <PolarizedMethodCard/>
  </details>
  <details className="goals-event-scout" onToggle={event=>setShowEventScout(event.currentTarget.open)}>
   <summary><span><strong>Veranstaltungsdaten &amp; Wettkampfarchiv</strong>
    <small>Event Scout, Veranstalter-Webseite, Quellen und gespeicherte Strecken</small></span>
    <Icon name="chevron-down"/></summary>
   {showEventScout&&<RaceEventResearch active={active&&showEventScout}
    refreshKey={revision} onEventSaved={changed}/>}
  </details>
  <p className="goals-hint">Dein Ziel steuert den Trainingsaufbau. Rennwetter, Streckenanalyse,
   Verpflegung und Pausen für die nächste Veranstaltung findest du unter Race Prep.</p>
 </section>
}

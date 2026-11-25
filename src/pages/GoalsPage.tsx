import {useEffect,useState} from 'react'
import {CoachGoalPanel} from '../components/CoachGoalPanel'
import {RaceGoalsPanel} from '../components/RaceGoalsPanel'
import {CoachLongTermPlan} from '../components/CoachLongTermPlan'
import {ChallengeSetup} from '../components/ChallengeSetup'
import type {GoalRouteSummary} from '../lib/goalRouteSummary'
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
 const [routeSummary,setRouteSummary]=useState<GoalRouteSummary|null>(null)
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
 const changed=()=>{setRouteSummary(null);setLoading(true);setRevision(x=>x+1);window.dispatchEvent(new Event('garmin-ai-coach-changed'))}
 return <section className={active?'page active goals-page':'page goals-page'}
  aria-label="Goals und langfristige Trainingsziele">
  <header className="page-intro goals-intro">
   <div><div className="eyebrow">GARMIN_AI / GOALS</div>
    <h1>Meine Ziele</h1>
    <p>Dein nächstes Abenteuer. Dein Plan.</p></div>
   <button type="button" className="goals-race-link" onClick={()=>onGo('race')}>
    <Icon name="flag"/> Race Prep öffnen <Icon name="arrow-up-right"/>
   </button>
  </header>
  <CoachGoalPanel key={'primary-'+revision} active={active} onSaved={changed} routeSummary={routeSummary}/>
  {loading&&<p role="status" className="goals-status">Trainingsfahrplan wird aktualisiert …</p>}
  {error&&<p role="alert" className="goals-status">{error}</p>}
  <RaceGoalsPanel key={'portfolio-'+revision} active={active} onPrimaryChange={changed}/>
  {snapshot&&!loading&&!error&&<CoachLongTermPlan today={berlinDateToday()} snapshot={snapshot}/>}
  <ChallengeSetup active={active} revision={revision} onSaved={changed} onRouteSummary={setRouteSummary}
   onEventScout={()=>{const el=document.getElementById('goals-event-scout');if(el instanceof HTMLDetailsElement){el.open=true;el.scrollIntoView({behavior:'smooth',block:'start'})}}}/>
  <details className="goals-event-scout" id="goals-event-scout" onToggle={event=>setShowEventScout(event.currentTarget.open)}>
   <summary><span><strong>Veranstaltungsdaten &amp; Wettkampfarchiv</strong>
    <small>Event Scout, Veranstalter-Webseite, Quellen und gespeicherte Strecken</small></span>
    <Icon name="chevron-down"/></summary>
   {showEventScout&&<RaceEventResearch active={active&&showEventScout}
    refreshKey={revision} onEventSaved={changed}/>}
  </details>
  <button className="goals-analysis-link" type="button" onClick={()=>onGo('training')}>Trainingsfortschritt in Analyse ansehen <Icon name="arrow-up-right"/></button>
 </section>
}

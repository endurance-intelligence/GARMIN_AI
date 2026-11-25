import {useEffect,useRef,useState} from 'react'
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
 const [planRevision,setPlanRevision]=useState(0)
 const portfolioDialog=useRef<HTMLDialogElement>(null)
 const openPortfolio=()=>{const el=portfolioDialog.current;if(el&&!el.open)el.showModal()}
 useEffect(()=>{
  if(!active){portfolioDialog.current?.close();return}
  window.addEventListener('garmin-ai-add-race-goal',openPortfolio)
  return ()=>window.removeEventListener('garmin-ai-add-race-goal',openPortfolio)
 },[active])
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
 },[active,revision,planRevision])
 const changed=()=>{setRouteSummary(null);setLoading(true);setRevision(x=>x+1);window.dispatchEvent(new Event('garmin-ai-coach-changed'))}
 return <section className={active?'page active goals-page':'page goals-page'}
  aria-label="Goals und langfristige Trainingsziele">
  <header className="page-intro goals-intro">
   <div><div className="eyebrow">GARMIN_AI / GOALS</div>
    <h1>Meine Ziele</h1>
    <p>Dein nächstes Abenteuer. Dein Plan.</p></div>
   <div className="goals-header-actions">
    <button type="button" className="goals-race-link goals-portfolio-link" onClick={openPortfolio}><Icon name="target"/> Weitere Ziele</button>
    <button type="button" className="goals-race-link" onClick={()=>onGo('race')}>
     <Icon name="flag"/> Race Prep öffnen <Icon name="arrow-up-right"/>
    </button>
   </div>
  </header>
  <CoachGoalPanel key={'primary-'+revision} active={active} onSaved={changed} routeSummary={routeSummary}/>
  {loading&&<p role="status" className="goals-status">Trainingsfahrplan wird aktualisiert …</p>}
  {error&&<p role="alert" className="goals-status">{error}</p>}
  {snapshot&&!loading&&!error&&<CoachLongTermPlan today={berlinDateToday()} snapshot={snapshot}/>}
  <ChallengeSetup active={active} revision={revision} onSaved={changed} onRouteSummary={setRouteSummary} summaryOnly/>
  <dialog ref={portfolioDialog} className="goals-portfolio-dialog" aria-labelledby="goals-portfolio-title" onClose={()=>setShowEventScout(false)}>
   <header className="goals-portfolio-header"><h2 id="goals-portfolio-title">Ziele verwalten</h2><button type="button" className="goals-dialog-close" aria-label="Zielverwaltung schließen" onClick={()=>portfolioDialog.current?.close()}><Icon name="x"/></button></header>
   <RaceGoalsPanel key={'portfolio-'+revision} active={active} onPrimaryChange={changed} onPortfolioChange={()=>setPlanRevision(n=>n+1)}/>
  <details className="goals-event-scout" id="goals-event-scout" open={showEventScout} onToggle={event=>setShowEventScout(event.currentTarget.open)}>
   <summary><span><strong>Veranstaltungsdaten &amp; Wettkampfarchiv</strong>
    <small>Event Scout, Veranstalter-Webseite, Quellen und gespeicherte Strecken</small></span>
    <Icon name="chevron-down"/></summary>
   {showEventScout&&<RaceEventResearch active={active&&showEventScout}
    refreshKey={revision} onEventSaved={changed}/>}
  </details>
  </dialog>
 </section>
}

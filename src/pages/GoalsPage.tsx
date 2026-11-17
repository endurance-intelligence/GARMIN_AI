import {useEffect,useState} from 'react'
import {CoachGoalPanel} from '../components/CoachGoalPanel'
import {RaceGoalsPanel} from '../components/RaceGoalsPanel'
import {CoachLongTermPlan} from '../components/CoachLongTermPlan'
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
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setLoading(true);setError('')
  void garminSupabase.auth.getSession().then(({data:{session}})=>{
   if(!session)throw Error('Bitte anmelden.')
   return loadCoachSnapshot(session,berlinDateToday(),controller.signal)
  }).then(value=>{if(mounted)setSnapshot(value)})
   .catch(e=>{if(mounted&&e?.name!=='AbortError')
    setError(e instanceof Error?e.message:'Trainingsziel derzeit nicht verfügbar.')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,revision])
 const changed=()=>{setRevision(x=>x+1);window.dispatchEvent(new Event('garmin-ai-coach-changed'))}
 return <section className={active?'page active goals-page':'page goals-page'}
  aria-label="Goals und langfristige Trainingsziele">
  <header className="page-intro goals-intro">
   <div><div className="eyebrow">GARMIN_AI / GOALS</div>
    <h1>Deine Ziele. Dein Weg.</h1>
    <p>Hauptziel, weitere Rennen und langfristiger Trainingsaufbau – alles an einem Ort.</p></div>
   <button type="button" className="goals-race-link" onClick={()=>onGo('race')}>
    <Icon name="flag"/> Race Prep öffnen <Icon name="arrow-up-right"/>
   </button>
  </header>
  <CoachGoalPanel key={'primary-'+revision} active={active} onSaved={changed}/>
  <RaceGoalsPanel key={'portfolio-'+revision} active={active} onPrimaryChange={changed}/>
  {snapshot&&<CoachLongTermPlan today={berlinDateToday()} snapshot={snapshot}/>}
  {loading&&!snapshot&&<p role="status" className="goals-status">Lade deinen langfristigen Trainingsfahrplan …</p>}
  {error&&<p role="alert" className="goals-status">{error}</p>}
  <p className="goals-hint">Dein Ziel steuert den Trainingsaufbau. Wetter, Strecke,
   Verpflegung und Pausen für die nächste Veranstaltung findest du unter Race Prep.</p>
 </section>
}

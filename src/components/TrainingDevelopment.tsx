import {useEffect,useState} from 'react'
import {garminSupabase} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {CoachProgressPulse} from './CoachProgressPulse'
import {GoalProgressCard} from './GoalProgressCard'
import {CoachSessionBridge} from './CoachSessionBridge'
import {CrossTrainingCoachCard} from './CrossTrainingCoachCard'
import {CoachEvidenceSummary} from './CoachEvidenceSummary'
import {GarminFeedbackCard} from './GarminFeedbackCard'
import {CoachNextImpactCard} from './CoachNextImpactCard'
import {CoachAdaptiveVolumeCard} from './CoachAdaptiveVolumeCard'
import {CoachFourWeekCard} from './CoachFourWeekCard'
import {CoachMemoryCard} from './CoachMemoryCard'
import {WeeklyPlanActualCard} from './WeeklyPlanActualCard'
import {buildSevenDayCoach,coachAddDays,coachMonday} from '../lib/coachSevenDay.mjs'
import {CoachLongTermCard} from './CoachLongTermCard'

/** Deliberately on demand: opening a particular Garmin run never loads older weeks. */
export function TrainingDevelopment({active,onGoals,onRacePrep,onOpenSession,onOpenCalendar,onStrength}:{
 active:boolean;onGoals:()=>void;onRacePrep:()=>void;onOpenSession:(id:string)=>void;onOpenCalendar:()=>void;onStrength:()=>void
}){
 const [evidenceOpen,setEvidenceOpen]=useState(false)
 const [snapshot,setSnapshot]=useState<CoachSnapshot|null>(null)
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(false)
 const [refresh,setRefresh]=useState(0)
 const today=berlinDateToday()
 const plan=snapshot?buildSevenDayCoach({today,health:snapshot.health,boards:snapshot.boards,options:snapshot.options,plans:snapshot.plans,goal:snapshot.goal,life:snapshot.life,racePortfolio:snapshot.racePortfolio,goalRoute:snapshot.goalRoute}):null
 useEffect(()=>{
  if(!active||!garminSupabase){setSnapshot(null);return}
  let mounted=true
  const controller=new AbortController()
  setSnapshot(null);setError('');setLoading(true)
  void garminSupabase.auth.getSession().then(({data:{session}})=>{
   if(!session)throw Error('Bitte anmelden.')
   return loadCoachSnapshot(session,today,controller.signal,undefined,4)
  }).then(value=>{if(mounted)setSnapshot(value)})
   .catch(e=>{if(mounted&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Trainingshistorie nicht verfügbar.')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,today,refresh])
 if(!active)return null
 return <section className="lsa-development training-view-panel" aria-label="Meine Entwicklung">
  <header className="training-view-heading"><h2>Meine Entwicklung</h2><p>4, 8 und 12 Wochen · Tempo/Puls · Referenzstrecken</p></header>
  <div className="lsa-development-body">
   {loading&&<p role="status" className="lsa-note">Garmin-Historie wird geladen …</p>}
   {error&&<p role="alert" className="lsa-error">{error}</p>}
   {!garminSupabase&&<p className="lsa-note">Garmin-Verbindung nicht konfiguriert.</p>}
   {garminSupabase&&!loading&&<button type="button" className="secondary" onClick={()=>setRefresh(n=>n+1)}>Entwicklung aktualisieren</button>}
   {snapshot&&!loading&&!error&&<>
    <GoalProgressCard today={today} snapshot={snapshot} onRacePrep={onRacePrep}/>
    <CoachProgressPulse today={today} snapshot={snapshot}
     onOpenLongTerm={()=>window.dispatchEvent(new Event('garmin-ai-open-long-term-progress'))} onGoals={onGoals}/>
    <CoachLongTermCard today={today} snapshot={snapshot} active={active}/>
    <CoachSessionBridge snapshot={snapshot} today={today} onOpenSession={onOpenSession}/>
    <details open={evidenceOpen} onToggle={event=>setEvidenceOpen(event.currentTarget.open)}><summary>Coach-Lernsignale &amp; Trainingsbelastung</summary>
     {evidenceOpen&&<>
     <GarminFeedbackCard snapshot={snapshot} today={today}/>
     <CoachNextImpactCard impact={plan?.nextImpact}/>
     {plan?.adaptiveVolume&&<CoachAdaptiveVolumeCard review={plan.adaptiveVolume}/>}
     <CoachFourWeekCard today={today} snapshot={snapshot}/><CoachMemoryCard today={today} snapshot={snapshot}/>
     {plan?.completedWeek&&<WeeklyPlanActualCard review={plan.completedWeek} onCalendar={onOpenCalendar}/>}
     <CoachEvidenceSummary active={active&&evidenceOpen} mode="weekly" weekStart={coachAddDays(coachMonday(today),-7)}/>
     <CrossTrainingCoachCard active={active&&evidenceOpen} onOpen={onStrength}/>
     </>}
    </details>
   </>}
  </div>
 </section>
}

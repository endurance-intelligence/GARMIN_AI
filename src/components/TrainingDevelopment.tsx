import {useEffect,useState} from 'react'
import {garminSupabase} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {CoachProgressPulse} from './CoachProgressPulse'
import {GoalProgressCard} from './GoalProgressCard'
import {CoachLongTermCard} from './CoachLongTermCard'

/** Deliberately on demand: opening a particular Garmin run never loads older weeks. */
export function TrainingDevelopment({active,focusToken,onGoals,onRacePrep}:{
 active:boolean;focusToken?:number;onGoals:()=>void;onRacePrep:()=>void
}){
 const [open,setOpen]=useState(false)
 const [snapshot,setSnapshot]=useState<CoachSnapshot|null>(null)
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(false)
 const [refresh,setRefresh]=useState(0)
 const today=berlinDateToday()
 useEffect(()=>{setOpen(false)},[focusToken])
 useEffect(()=>{
  if(!active||!open||!garminSupabase){setSnapshot(null);return}
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
 },[active,open,today,refresh])
 if(!active)return null
 return <details className="lsa-development" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><span><strong>Meine Entwicklung</strong><small>4, 8 und 12 Wochen · Tempo/Puls · Referenzstrecken</small></span><span aria-hidden="true">⌄</span></summary>
  {open&&<div className="lsa-development-body">
   {loading&&<p role="status" className="lsa-note">Garmin-Historie wird geladen …</p>}
   {error&&<p role="alert" className="lsa-error">{error}</p>}
   {!garminSupabase&&<p className="lsa-note">Garmin-Verbindung nicht konfiguriert.</p>}
   {garminSupabase&&!loading&&<button type="button" className="secondary" onClick={()=>setRefresh(n=>n+1)}>Historie aktualisieren</button>}
   {snapshot&&!loading&&!error&&<>
    <GoalProgressCard today={today} snapshot={snapshot} onRacePrep={onRacePrep}/>
    <CoachProgressPulse today={today} snapshot={snapshot}
     onOpenLongTerm={()=>window.dispatchEvent(new Event('garmin-ai-open-long-term-progress'))} onGoals={onGoals}/>
    <CoachLongTermCard today={today} snapshot={snapshot} active={active&&open}/>
   </>}
  </div>}
 </details>
}

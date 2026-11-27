import {useEffect,useState} from 'react'
import {TrainingHistory} from '../components/TrainingHistory'
import {LiveSessionAnalyst} from '../components/LiveSessionAnalyst'
import {TrainingDevelopment} from '../components/TrainingDevelopment'
import type {Page} from '../navigation'
import '../styles/training-workspace.css'

const views=[
 {id:'session',title:'Einzelanalyse',description:'Lauf & Coach-Fazit'},
 {id:'development',title:'Entwicklung',description:'Fortschritt & Trends'},
 {id:'history',title:'Historie',description:'Wochen & Monate'}
] as const
type View=typeof views[number]['id']

/** One visible analysis scope and one active reader at a time. */
export function TrainingPage({active,focus,onGo,onOpenSession,onOpenCalendar}:{active:boolean;onGo:(page:Page)=>void;onOpenSession:(id:string)=>void;onOpenCalendar:()=>void;
 focus?:{activityId:string;token:number}|null}){
 const [view,setView]=useState<View>('session')
 const [historyFocus,setHistoryFocus]=useState(0)
 useEffect(()=>{
  if(focus?.token!==undefined)setView('session')
 },[focus?.token])
 useEffect(()=>{
  const history=()=>{setHistoryFocus(n=>n+1);setView('history')}
  const development=()=>setView('development')
  window.addEventListener('garmin-ai-open-training-history',history)
  window.addEventListener('garmin-ai-open-training-development',development)
  return ()=>{
   window.removeEventListener('garmin-ai-open-training-history',history)
   window.removeEventListener('garmin-ai-open-training-development',development)
  }
 },[])
 return <section className={active?'page active':'page'}>
  <div className="page-intro introduction-v3">
   <div><div className="eyebrow">TRAINING / ECHTE GARMIN-DATEN</div>
    <h1>Dein Training</h1>
    <p>Analysiere deinen Lauf, verfolge deine Entwicklung oder vergleiche geplantes und absolviertes Training.</p>
   </div>
  </div>
  <nav className="training-view-nav" aria-label="Trainingsanalyse auswählen">
   {views.map(item=><button type="button" key={item.id} aria-pressed={view===item.id} onClick={()=>setView(item.id)}>
    <strong>{item.title}</strong><small>{item.description}</small>
   </button>)}
  </nav>
  <TrainingHistory active={active&&view==='history'} focusToken={historyFocus} onCalendar={onOpenCalendar}/>
  <TrainingDevelopment active={active&&view==='development'} onGoals={()=>onGo('goals')} onRacePrep={()=>onGo('race')} onOpenSession={onOpenSession} onOpenCalendar={onOpenCalendar} onStrength={()=>onGo('strength')}/>
  <LiveSessionAnalyst active={active&&view==='session'} focus={focus}/>
  <p className="page-disclaimer">Nur echte Garmin-Daten. Keine künstlichen Trainingsnoten,
   keine vorgetäuschten Analyseergebnisse und keine automatischen Änderungen am Trainingsplan.</p>
 </section>
}

import {LiveSessionAnalyst} from '../components/LiveSessionAnalyst'
import {TrainingDevelopment} from '../components/TrainingDevelopment'
import type {Page} from '../navigation'

/** Single-run evidence and optional longitudinal analysis share the existing Garmin models. */
export function TrainingPage({active,focus,onGo,onOpenSession,onOpenCalendar}:{active:boolean;onGo:(page:Page)=>void;onOpenSession:(id:string)=>void;onOpenCalendar:()=>void;
 focus?:{activityId:string;token:number}|null}){
 return <section className={active?'page active':'page'}>
  <div className="page-intro introduction-v3">
   <div><div className="eyebrow">SESSION INTELLIGENCE / ECHTE GARMIN-DATEN</div>
    <h1>Dein Training</h1>
    <p>Dein Coach bewertet absolvierte Läufe anhand der tatsächlichen Garmin-Daten,
     erkennt den Trainingstyp automatisch und berücksichtigt dein Hauptziel.</p>
   </div>
  </div>
  <TrainingDevelopment active={active} focusToken={focus?.token} onGoals={()=>onGo('goals')} onRacePrep={()=>onGo('race')} onOpenSession={onOpenSession} onOpenCalendar={onOpenCalendar} onStrength={()=>onGo('strength')}/>
  <LiveSessionAnalyst active={active} focus={focus}/>
  <p className="page-disclaimer">Nur echte Garmin-Daten. Keine künstlichen Trainingsnoten,
   keine vorgetäuschten Analyseergebnisse und keine automatischen Änderungen am Trainingsplan.</p>
 </section>
}

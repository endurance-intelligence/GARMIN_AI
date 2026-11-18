import {LiveSessionAnalyst} from '../components/LiveSessionAnalyst'
import type {Page} from '../navigation'

/** Only the real Garmin run analysis belongs on this page.
 * The standalone Stabi Studio remains accessible through the app navigation.
 * Aerobic comparison stays available as a separate component for future use.
 */
export function TrainingPage({active}:{active:boolean;onGo:(page:Page)=>void}){
 return <section className={active?'page active':'page'}>
  <div className="page-intro introduction-v3">
   <div><div className="eyebrow">SESSION INTELLIGENCE / ECHTE GARMIN-DATEN</div>
    <h1>Jede Einheit.<br/><span className="gradient-word">Eine Erkenntnis.</span></h1>
    <p>Dein Coach bewertet absolvierte Läufe anhand der tatsächlichen Garmin-Daten,
     erkennt den Trainingstyp automatisch und berücksichtigt dein Hauptziel.</p>
   </div>
  </div>
  <LiveSessionAnalyst active={active}/>
  <p className="page-disclaimer">Nur echte Garmin-Daten. Keine künstlichen Trainingsnoten,
   keine vorgetäuschten Analyseergebnisse und keine automatischen Änderungen am Trainingsplan.</p>
 </section>
}

import {makeTrackLapGuide,splitClock,lapStepSummary} from '../lib/trackLapGuide'
import type {TrainerWorkout} from '../lib/workoutLibrary'
import '../styles/track-lap-preview.css'

export function TrackLapPreview({workout,group}:{
 workout:TrainerWorkout;group:string
}){
 const steps=makeTrackLapGuide(workout,group)
 const runs=steps.filter(s=>s.type==='run')
 return <details className="tl-root">
  <summary>
   <span className="tl-icon" aria-hidden="true">◉</span>
   <span><strong>Bahnmodus · LAP an der Markierung</strong>
    <small>{runs.length} Intervalle · Pace und Block auf einen Blick · ohne GPS-Autostopp</small></span>
  </summary>
  <div className="tl-content">
   <p>Für die 400-m-Bahn: Jeder Belastungs- und Trababschnitt wird <strong>per LAP</strong>
    an der echten Streckenmarkierung beendet. Distanzen und Zielzeiten sind
    Hinweise, keine automatischen Umschaltpunkte. Dadurch schaltet die Uhr nicht
    einige Meter vor der Linie zum nächsten Abschnitt.</p>
   <div className="tl-run-grid">
    {runs.map(s=><article className="tl-run" key={s.index}>
      <div className="tl-run-label">SATZ {s.block}/{s.blocks} · INTERVALL {s.repeat}/{s.repeats}</div>
      <div className="tl-run-values">
       <strong>{s.distanceMeters??'–'} m</strong>
       <span>{s.paceLabel??'Pace fehlt'}/km</span>
      </div>
      <div className="tl-run-times">
       {s.fourHundredSeconds!==null&&<span>400 m: {splitClock(s.fourHundredSeconds)}</span>}
       {s.expectedSeconds!==null&&<span>Gesamt: {splitClock(s.expectedSeconds)}</span>}
      </div>
    </article>)}
   </div>
   <details className="tl-all-steps">
    <summary>Alle LAP-Schritte einschließlich Trabpausen</summary>
    <ol>{steps.map(s=><li key={s.index}>
      <span>{lapStepSummary(s)}</span>
      <small>Danach LAP drücken</small>
    </li>)}</ol>
   </details>
   <p className="tl-limitation">
    <strong>Status: nur Vorschau.</strong> GARMIN_AI hat dieses Workout noch nicht
    in Garmin Connect erstellt oder auf deine Forerunner übertragen. Für die
    Nutzung auf der Uhr müsste es als strukturiertes Training mit
    „Lap Button Press“ pro Schritt eingerichtet und synchronisiert werden.
   </p>
  </div>
 </details>
}

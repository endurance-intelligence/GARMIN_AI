import {analyzeGarminPerception} from '../lib/garminPerception.mjs'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {Icon} from './Icon'
import '../styles/garmin-feedback.css'

export function GarminFeedbackCard({snapshot,today}:{
 snapshot:CoachSnapshot;today:string
}){
 const view=analyzeGarminPerception(snapshot.boards,today)
 const latest=view.latest
 return <details className={'gfb-root is-'+view.level}
  aria-label="Automatisch übernommene Garmin-Trainingsbewertungen">
  <summary className="gfb-head">
   <span className="gfb-icon"><Icon name="activity"/></span>
   <span className="gfb-copy">
    <small>DEIN TRAININGSFEEDBACK · AUTOMATISCH AUS GARMIN</small>
    <strong>Kein zweites Formular.</strong>
    <span>{view.summary}</span>
   </span>
   <span className="gfb-counter">{view.count14}<small>RPE / 14 Tage</small></span>
   <Icon name="chevron-down"/>
  </summary>
  <div className="gfb-body">
   {latest&&<div className="gfb-latest">
    <strong>{latest.title}</strong>
    <span>{latest.date.slice(8,10)+'.'+latest.date.slice(5,7)+'.'+latest.date.slice(0,4)}</span>
    <div className="gfb-values">
     <span>Anstrengung: <strong>{latest.rpe===null?'nicht angegeben':latest.rpe+'/10'}</strong></span>
     <span>Gefühl danach: <strong>{latest.feelingLabel||'nicht angegeben'}</strong></span>
    </div>
   </div>}
   <p className="gfb-advice">{view.advice}</p>
   <p className="gfb-explain">GARMIN_AI liest deine nach dem Training
    in Garmin gespeicherte Anstrengung und dein Gefühl. Wenn einzelne Bewertungen
    noch nicht synchronisiert sind, werden sie nicht geraten.
    Intervals.icu bleibt ergänzende Trainingsdatenquelle.</p>
   <p className="gfb-illness">Krankheit, Beschwerden oder längere Trainingspausen
    trägst du weiterhin über <strong>„Krank/Beschwerden“</strong> ein.</p>
  </div>
 </details>
}

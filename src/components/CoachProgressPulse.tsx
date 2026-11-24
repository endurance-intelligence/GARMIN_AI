import {useMemo} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {buildCoachProgressStory} from '../lib/coachProgressStory.mjs'
import {Icon} from './Icon'
import '../styles/coach-progress-pulse.css'

const fmt=(n:number|null)=>
 n===null?'–':n.toLocaleString('de-DE',{maximumFractionDigits:1})
const weekLabel=(date:string)=>date.slice(8,10)+'.'+date.slice(5,7)+'.'
export function CoachProgressPulse({today,snapshot,onOpenLongTerm,onGoals}:{
 today:string;snapshot:CoachSnapshot;
 onOpenLongTerm:()=>void;onGoals:()=>void
}){
 const progress=useMemo(()=>buildCoachProgressStory({today,snapshot}),[today,snapshot])
 if(!progress)return null
 const available=progress.weeks.filter(w=>w.km!==null).map(w=>w.km as number)
 const maxKm=Math.max(1,...available)
 return <section className="cpp-root" aria-label="Deine Entwicklung – Garmin-Fortschritt mit überprüfbaren Daten">
  <header className="cpp-head">
   <div>
    <span className="cpp-eyebrow"><Icon name="activity"/> DEINE ENTWICKLUNG · GARMIN</span>
    <h2>Was dein Training bisher zeigt.</h2>
    <p>Vier abgeschlossene Wochen. Kein erfundener Fitnesswert.</p>
   </div>
   <span className={'cpp-coverage '+(progress.status==='complete'?'is-complete':'is-limited')}>
    {progress.knownWeeks} von 4 Wochen mit Distanzdaten
   </span>
  </header>
  <div className="cpp-metrics">
   <div className="cpp-metric">
    <span><Icon name="calendar-days"/> REGELMÄSSIGKEIT</span>
    <strong>{progress.activeWeeks===null?'–':progress.activeWeeks+' / 4'}</strong>
    <small>{progress.activeWeeks===null?'Unvollständige Historie':
     'Wochen mit echten Garmin-Läufen'}</small>
   </div>
   <div className="cpp-metric">
    <span><Icon name="footprints"/> LAUFUMFANG</span>
    <strong>{fmt(progress.totalKm)}{progress.totalKm===null?'':' km'}</strong>
    <small>{progress.totalKm===null?'Vollständige Distanz noch nicht belegbar':
     'Summe der vier vollständigen Wochen'}</small>
   </div>
   <div className="cpp-metric">
    <span><Icon name="activity"/> LÄNGSTER BELEGTER LAUF</span>
    <strong>{progress.longest?progress.longest.minutes+' Min.':'–'}</strong>
    <small>{progress.longest?
     (progress.longest.distanceKm===null?'Distanz nicht verfügbar':
      fmt(progress.longest.distanceKm)+' km')+' · Garmin':
     'Noch keine verlässliche Laufdauer'}</small>
   </div>
  </div>
  <div className="cpp-story">
   <div className="cpp-week-panel">
    <div className="cpp-mini-head">
     <strong>Der Umfang in deinen letzten vier Wochen</strong>
     <span>Jeweils Mo–So, ohne laufende Woche</span>
    </div>
    <div className="cpp-week-grid" aria-label="Laufkilometer in vier abgeschlossenen ISO-Wochen">
     {progress.weeks.map(w=><div className="cpp-week" key={w.start}>
      <div className="cpp-week-track">
       {w.km===null?<span className="cpp-missing" aria-label="Kilometer nicht verfügbar"/>:
        <span className="cpp-week-fill"
         style={{height:(w.km>0?Math.max(3,w.km/maxKm*100):0)+'%'}}
         aria-label={fmt(w.km)+' km'}/>}
      </div>
      <strong>{w.km===null?'–':fmt(w.km)}</strong>
      <small>{weekLabel(w.start)}</small>
     </div>)}
    </div>
    <p className="cpp-trend">{progress.trendText}</p>
   </div>
   <div className="cpp-interpretation">
    <strong><Icon name={progress.loadCaution?'heart-pulse':'check-circle'}/>
     WAS DER COACH DARAUS ABLEITET</strong>
    <p>{progress.loadNote}</p>
    <p>{progress.next}</p>
   </div>
  </div>
  <div className="cpp-performance">
   <div>
    <strong><Icon name="target"/> Bin ich wirklich schneller geworden?</strong>
    <p>{progress.performanceNote}</p>
   </div>
   <button type="button" onClick={onOpenLongTerm}>
    Tempo/Puls und Streckenvergleich prüfen <Icon name="arrow-up-right"/>
   </button>
  </div>
  <div className="cpp-footer">
   <button className="cpp-goals" type="button" onClick={onGoals}>
    Ziel- und Trainingsfortschritt ansehen <Icon name="arrow-up-right"/>
   </button>
   <details className="cpp-explain">
    <summary>Wie liest der Coach diese Werte?</summary>
    <p>{progress.caveat}</p>
    <p>Erst ein ausreichend vergleichbarer Tempo-/Herzfrequenz- oder
     GPS-Streckenvergleich kann auf eine beobachtete Leistungsänderung hinweisen.
     Wetter, Untergrund, Ermüdung und Messqualität bleiben mögliche Einflussfaktoren.</p>
   </details>
  </div>
 </section>
}

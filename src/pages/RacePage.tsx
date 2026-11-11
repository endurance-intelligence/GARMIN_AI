import {useState} from 'react'
import {Icon} from '../components/Icon'
import {CoachGoalPanel} from '../components/CoachGoalPanel'
import {RaceEventResearch} from '../components/RaceEventResearch'
import {WeatherPanel} from '../components/WeatherPanel'
import type {Page} from '../navigation'
export function RacePage({active,onGo}:{active:boolean;onGo:(page:Page)=>void}){
 const [researchRefresh,setResearchRefresh]=useState(0)
 return <section className={active?'page active':'page'}>
  <div className="page-intro">
   <div><div className="eyebrow">RACE INTELLIGENCE / DEIN NÄCHSTES ZIEL</div>
    <h1>Ein Ziel. Ein klarer Weg<span style={{color:'var(--a)'}}>.</span></h1>
    <p>Hier legst du fest, worauf dich dein Coach vorbereiten soll.
     Das Ziel wird gespeichert und die Vorbereitungsphase automatisch aus dem Datum abgeleitet.</p></div>
  </div>
  <CoachGoalPanel active={active} onSaved={()=>setResearchRefresh(n=>n+1)}/>
  <RaceEventResearch active={active} refreshKey={researchRefresh}/>
  <WeatherPanel active={active} mode="race"/>
  <div className="sub-grid">
   <article><small>WIE DER COACH PLANEN SOLL</small>
    <h3>Alle sieben Tage sinnvoll nutzen.</h3>
    <p>Fußball, ORC Track und ORC Run sind feste Optionen – keine Pflichttermine.
     Die übrigen Tage sind für lockere Läufe, lange Einheiten, Stabi & Mobility oder Erholung verfügbar.</p>
    <p>Die Vorschläge müssen zu deinem Ziel, deinen echten Garmin-Belastungsdaten,
     dem Schlaf-/HRV-Trend und deinem aktuellen Befinden passen.
     Änderungen am Kalender bleiben freigabepflichtig.</p>
    <button type="button" className="secondary" onClick={()=>onGo('calendar')}>
     Trainingswoche ansehen <Icon name="arrow-up-right"/></button>
   </article>
   <article><small>WETTKAMPFPHASE</small>
    <h3>Datum ist nicht Trainingsfreigabe.</h3>
    <p>Die Phase beschreibt nur die zeitliche Nähe zum Wettkampf. Krankheit,
     ungewöhnliche Ermüdung, Schmerzen und absolvierte Belastung können eine
     kurzfristige Anpassung erfordern.</p>
    <p>Automatische Trainingsentscheidungen, Race-Pacing und Versorgungsstrategie
     sind noch nicht als echte Coach-Logik freigeschaltet.</p>
   </article>
  </div>
 </section>
}

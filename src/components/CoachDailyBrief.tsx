import type {CoachDailyBrief as Brief} from '../lib/coachDailyBrief.mjs'
import {Icon} from './Icon'
import '../styles/coach-daily-brief.css'

const dateLabel=(d:string)=>d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4)
export function CoachDailyBrief({brief,onDecision,onReportSymptoms}:{
 brief:Brief;onDecision:()=>void;onReportSymptoms:()=>void
}){
 const cautious=['illness','recovery','blocked'].includes(brief.kind)||
  Boolean(brief.race?.daysSince!==undefined&&brief.race.daysSince<=5)
 return <section className={'cdb-root'+(cautious?' cdb-cautious':'')}
  aria-label="Dein Coach heute: Empfehlung, Begründung und nächster Schritt">
  <div className="cdb-heading">
   <span className="cdb-eyebrow"><Icon name="sparkles"/> DEIN COACH · HEUTE</span>
   <time dateTime={brief.date}>{dateLabel(brief.date)}</time>
  </div>
  <div className="cdb-context">
   <span className="cdb-label">{brief.label}</span>
   <h2>{brief.title}</h2>
   <p className="cdb-guidance">{brief.guidance}</p>
  </div>
  <div className="cdb-columns">
   <div className="cdb-reason">
    <strong><Icon name="activity"/> WARUM EMPFIEHLT DER COACH DAS?</strong>
    <p>{brief.reason}</p>
    {brief.minutes!==null&&<small>Vorgeschlagene Dauer: {brief.minutes} Min. · noch keine freigegebene Einheit</small>}
   </div>
   <div className="cdb-next">
    <strong><Icon name="check-circle"/> DEIN NÄCHSTER SCHRITT</strong>
    <p>{brief.next}</p>
   </div>
  </div>
  {brief.race&&<p className="cdb-race">
   <Icon name="flag"/>
   <span>{brief.race.name}: {brief.race.daysSince===0?'Renntag':
    brief.race.daysSince+'. Tag nach dem Rennen'}.
    {brief.race.actualKm!==null?
     ' '+brief.race.actualKm.toLocaleString('de-DE',{maximumFractionDigits:1})+
     ' km aus Garmin'+(brief.race.linkConfirmed?' von dir zugeordnet.':'.'):
     ' Noch keine eindeutig zugeordnete Garmin-Rennaufzeichnung.'}
    {' '}Erholungsphase – keine automatische Trainingsfreigabe.
   </span>
  </p>}
  {brief.dataNote&&<p className="cdb-data-note"><Icon name="alert-triangle"/>{brief.dataNote}</p>}
  {brief.symptomNote&&<p className="cdb-symptom-note"><Icon name="info"/>{brief.symptomNote}</p>}
  <div className="cdb-actions">
   <button type="button" className="cdb-primary" onClick={onDecision}>
    {brief.actionLabel} <Icon name="arrow-up-right"/>
   </button>
   <button type="button" className="cdb-secondary" onClick={onReportSymptoms}>
    <Icon name="heart-pulse"/> Beschwerden / Pause melden
   </button>
  </div>
  <div className="cdb-foot">
   <span>I fall. I rise. I show up. I improve.</span>
   <small>{brief.motive}</small>
  </div>
  <p className="cdb-source">{brief.source}. Keine eigenständige Trainingsänderung, kein künstlicher Readiness-Score.</p>
 </section>
}

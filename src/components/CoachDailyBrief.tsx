import type {CoachDailyBrief as Brief} from '../lib/coachDailyBrief.mjs'
import {Icon} from './Icon'
import type {ReactNode} from 'react'
import '../styles/coach-daily-brief.css'

const dateLabel=(d:string)=>d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4)
export function CoachDailyBrief({brief,onDecision,onReportSymptoms,weather}:{
 brief:Brief;onDecision:()=>void;onReportSymptoms:()=>void;weather?:ReactNode
}){
 const cautious=['illness','recovery','blocked'].includes(brief.kind)||
  Boolean(brief.race?.daysSince!==undefined&&brief.race.daysSince<=5)
 return <section className={'cdb-root'+(cautious?' cdb-cautious':'')}
  aria-label="Dein Coach heute: Empfehlung, Begründung und nächster Schritt">
  <div className="cdb-heading">
   <span className="cdb-eyebrow"><Icon name="sparkles"/> DEIN TRAINING HEUTE</span>
   <time dateTime={brief.date}>{dateLabel(brief.date)}</time>
  </div>
  <div className="cdb-hero-main">
   <div className="cdb-context">
    <span className="cdb-label">{brief.label}</span>
    <h2>{brief.title}</h2>
    <p className="cdb-guidance">{brief.guidance}</p>
   </div>
   {brief.minutes!==null&&brief.label!=='TEILNAHME BESTÄTIGT'&&<div className="cdb-hero-duration"><strong>{brief.minutes}<em> min</em></strong><small>VORGESCHLAGENE DAUER</small></div>}
  </div>
  {weather&&<div className="cdb-weather">{weather}</div>}
  <div className="cdb-next">
   <strong><Icon name="check-circle"/> DEIN NÄCHSTER SCHRITT</strong>
   <p>{brief.next}</p>
  </div>
  <details className="cdb-reason cdb-reason-detail" open={cautious||brief.label==='TEILNAHME BESTÄTIGT'?true:undefined}>
   <summary><Icon name="activity"/> Coach-Einschätzung <Icon name="chevron-down"/></summary>
   <p>{brief.reason}</p>
  </details>
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
  <details className="cdb-provenance"><summary>Über diese Empfehlung</summary><p className="cdb-source">{brief.source}. Keine eigenständige Trainingsänderung, kein künstlicher Readiness-Score.</p><p className="cdb-motive">{brief.motive}</p><small>I fall. I rise. I show up. I improve.</small></details>
 </section>
}

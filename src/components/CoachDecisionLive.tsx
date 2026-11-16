import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import {selectCoachDecision} from '../lib/coachDecision.mjs'
import {Icon} from './Icon'
import '../styles/coach-decision-live.css'

const dated=(date:string)=>new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',
 weekday:'long',day:'2-digit',month:'2-digit'}).format(new Date(date+'T12:00:00Z'))
type Props={plan:SevenDayPlan;reviewDate:string|null;saving:boolean;
 onReview:(date:string)=>void;onCalendar:(date:string)=>void;onPlan:()=>void}
export function CoachDecisionLive({plan,reviewDate,saving,onReview,onCalendar,onPlan}:Props){
 const x=selectCoachDecision(plan)
 if(!x)return null
 const {day}=x
 const reviewIsOpen=reviewDate===day.date
 return <section className="cdl-root" aria-label="Echte Coach-Entscheidung mit Begründung">
  <header className="cdl-head">
   <div><span className="cdl-kicker"><Icon name="sparkles"/> COACH INTELLIGENCE · LIVE</span>
    <h3>Deine nächste Entscheidung.</h3></div>
   <span className="cdl-owner">Du entscheidest. Keine automatische Änderung.</span>
  </header>
  <div className="cdl-grid">
   <article className="cdl-choice">
    <div className="cdl-choice-top">
     <span className="cdl-overline"><span className="cdl-led"/> VORSCHLAG / {dated(day.date).toUpperCase()}</span>
     <span className={'cdl-status cdl-status-'+x.state}>
      {x.actionable?'Prüfung offen':x.state==='calendar'?'Bereits eingetragen':'Kein Entwurf nötig'}
     </span>
    </div>
    <div className="cdl-choice-body">
     <h4>{x.headline}</h4>
     <p>{x.summary}</p>
     <div className="cdl-swap">
      <div><span>{x.state==='calendar'?'KALENDER':'BISHER'}</span>
       <strong>{x.current}</strong><small>{x.state==='calendar'?'Bestehender Eintrag wird nicht überschrieben':
        'Kein automatischer Eingriff in den Trainingsplan'}</small></div>
      <span className="cdl-arrow" aria-hidden="true">↗</span>
      <div><span>COACH-EMPFEHLUNG</span>
       <strong>{x.proposal}</strong>
       <small>{day.minutes!==null?day.minutes+' Minuten · ':''}
        {x.actionable?'Nur nach Bestätigung als Entwurf':x.state==='calendar'?'Keine zweite Einheit':'Keine Kalenderänderung'}</small></div>
     </div>
     <div className="cdl-actions">
      {x.actionable?
       <button className="cdl-primary" type="button" disabled={saving}
        onClick={()=>onReview(day.date)}>
        <Icon name="check"/> {reviewIsOpen?'Freigabe unten fortsetzen':'Vorschlag prüfen'}
        <Icon name="arrow-up-right"/>
       </button>:
       x.state==='calendar'?
       <button className="cdl-primary" type="button" onClick={()=>onCalendar(day.date)}>
        <Icon name="calendar-days"/> Im Kalender prüfen <Icon name="arrow-up-right"/></button>:
       <button className="cdl-primary cdl-nonwrite" type="button" onClick={onPlan}>
        <Icon name="calendar-days"/> 7-Tage-Plan ansehen <Icon name="arrow-up-right"/></button>}
      <button className="cdl-secondary" type="button" onClick={onPlan}>
       Ganze Woche <Icon name="arrow-up-right"/></button>
     </div>
     <p className="cdl-smallprint">{x.actionable?
      '„Vorschlag prüfen“ öffnet die echte Entwurfsbestätigung des 7-Tage-Coaches. Erst danach folgt separat die Kalenderfreigabe.':
      'Dieser Status ist eine Coach-Einordnung, kein automatisch erzeugter Trainingsplan.'}</p>
    </div>
    <div className="cdl-art" aria-hidden="true"><div className="cdl-orbit-one"/>
     <div className="cdl-orbit-two"/><div className="cdl-orbit-three"/>
     <div className="cdl-orbit-center"><Icon name="activity"/></div></div>
   </article>
   <article className="cdl-why">
    <div className="cdl-why-head"><span className="cdl-overline">THE REASONING / ECHTE DATEN</span>
     <span className="cdl-star" aria-hidden="true">✦</span></div>
    <h4>Warum dieser<br/>Vorschlag?</h4>
    <div className="cdl-specific"><strong>Für {dated(day.date)}:</strong> {x.reason}</div>
    <div className="cdl-factors">
     {x.causes.map((c,i)=><div className="cdl-factor" key={c.key}>
      <span className="cdl-factor-number">{String(i+1).padStart(2,'0')}</span>
      <div><strong>{c.title}</strong><p>{c.text}</p></div>
      <span className={'cdl-factor-dot cdl-factor-'+c.key} aria-hidden="true"/>
     </div>)}
    </div>
    {x.flags.length>0&&<p className="cdl-flags"><strong>Zusätzliche Signale:</strong> {x.flags.join(' · ')}</p>}
    <p className="cdl-why-foot">{x.attentionText} Kein künstlicher Readiness-Wert und keine medizinische Freigabe.</p>
   </article>
  </div>
 </section>
}

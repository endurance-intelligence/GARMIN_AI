import {buildLongTermCoachPlan} from '../lib/coachLongTermPlan.mjs'
import type {LongTermWeek} from '../lib/coachLongTermPlan.mjs'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {Icon} from './Icon'
import '../styles/coach-long-term.css'

const short=(date:string)=>date.slice(8,10)+'.'+date.slice(5,7)+'.'
const interval=(week:LongTermWeek)=>short(week.start)+' – '+short(week.end)
export function CoachLongTermPlan({today,snapshot}:{
 today:string;snapshot:CoachSnapshot
}){
 const plan=buildLongTermCoachPlan({
  today,goal:snapshot.goal,health:snapshot.health,life:snapshot.life,racePortfolio:snapshot.racePortfolio
 })
 const first=plan.weeks[0]
 return <details className="cltp-root" open aria-label="Dein langfristiger Trainingsfahrplan">
  <summary className="cltp-summary">
   <span className="cltp-symbol"><Icon name="calendar-range"/></span>
   <span className="cltp-summary-text">
    <small>DEIN ZIEL · MEHRWÖCHIGE PLANUNG</small>
    <strong>{plan.hasGoal&&plan.raceDate&&plan.raceDate>=today?'Dein Weg zum Wettkampf':'Dein weiterer Trainingsfahrplan'}</strong>
    <span>{first?first.phaseLabel+' · '+first.focus:
     'Hauptziel festlegen, dann Trainingsphasen planen'}</span>
   </span>
   <span className="cltp-counter">{plan.weeks.length?plan.weeks.length+' Wochen':'Kein Ziel'}<small>Vorschau</small></span>
   <Icon name="chevron-down"/>
  </summary>
  <div className="cltp-body">
   <p className="cltp-intro">{plan.message}</p>
   {plan.baselineKm!==null&&<p className="cltp-basis">
    Ausgangspunkt: deine letzten zwei Laufwochen mit ungefähr <strong>{plan.baselineKm} km/Woche</strong>.
    Die folgenden Umfänge sind Richtwerte, keine Trainingsfreigabe.
   </p>}
   {plan.weeks.length>0&&<div className="cltp-weeks" role="list">
    {plan.weeks.map(week=><article className={'cltp-week cltp-phase-'+week.phase} key={week.start} role="listitem">
     <div className="cltp-week-when">
      <small>WOCHE {week.index}</small>
      <strong>{interval(week)}</strong>
      {week.isCurrent&&<span>Diese Woche</span>}
     </div>
     <div className="cltp-week-content">
      <div className="cltp-week-title"><strong>{week.phaseLabel}</strong><span>{week.key}</span></div>
      <p>{week.focus}</p>
      <p className="cltp-polarized">{week.qualityOptions>0?
       'Maximal 1 harte Intervalloption · sonst locker.':'Diese Woche keine harte Einheit einplanen.'}</p>
      {week.targetKm!==null&&<p className="cltp-week-target">
       <Icon name="footprints"/> Laufumfang grob: {week.targetKm.low}–{week.targetKm.high} km
       {week.longRunMinutes!==null&&<span> · Langer Lauf: ca. {week.longRunMinutes} Min.</span>}
      </p>}
      {week.targetKm===null&&<small className="cltp-no-target">
       {week.isRaceWeek?'Kein normales Wochenziel in der Rennwoche.':
        week.phase==='recovery'?'Keine festen Kilometerziele während der Erholung.':
        'Keine feste Kilometer-Vorgabe; erst Daten und Befinden prüfen.'}
      </small>}
     </div>
    </article>)}
   </div>}
   {plan.notes.length>0&&<div className="cltp-notes">
    {plan.notes.map((note,i)=><p key={i}><Icon name="info"/> {note}</p>)}
   </div>}
   <p className="cltp-disclaimer">Nur Planungsrahmen. Keine automatischen Kalenderänderungen.
    Tagesform, tatsächliches Training und deine Freigabe bestimmen die nächsten Einheiten.</p>
  </div>
 </details>
}

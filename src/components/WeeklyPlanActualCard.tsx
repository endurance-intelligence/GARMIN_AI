import type {CompletedWeekReview} from '../lib/completedWeekReview.mjs'
import {Icon} from './Icon'
import '../styles/weekly-plan-actual.css'

const dateLabel=(d:string)=>d.slice(8,10)+'.'+d.slice(5,7)+'.'
const km=(n:number|null)=>n===null?'Nicht vollständig':n.toLocaleString('de-DE',{maximumFractionDigits:1})+' km'
export function WeeklyPlanActualCard({review,onCalendar}:{
 review:CompletedWeekReview;onCalendar:()=>void
}){
 const ready=review.status==='ready'
 return <details className={'wpa-root'+(review.adjustment==='shorten'?' is-adjusted':'')}
  aria-label="Wochenrückblick und Plan-Ist-Abgleich">
  <summary className="wpa-head">
   <span className="wpa-icon"><Icon name="calendar-range"/></span>
   <span className="wpa-title">
    <small>PLAN ↔ IST · LETZTE ABGESCHLOSSENE WOCHE</small>
    <strong>{ready?'Deine Woche → dein nächster Schritt':'Wochenrückblick prüfen'}</strong>
    <span>{ready?
     review.runCount+' Garmin-Läufe · '+km(review.distanceKm)+
      (review.adjustment==='shorten'?' · Coach schlägt eine kürzere Einheit vor':''):
     'Noch kein vollständiger Wochenbericht vorhanden'}</span>
   </span>
   <Icon name="chevron-down"/>
  </summary>
  <div className="wpa-body">
   <span className="wpa-period">{dateLabel(review.start)} – {dateLabel(review.end)}</span>
   <p>{review.summary}</p>
   {ready&&<div className="wpa-stats">
    <div><span>Gemacht / Garmin</span><strong>{review.runCount} Läufe</strong>
     <small>{km(review.distanceKm)}</small></div>
    <div><span>Freigegeben / Coach</span><strong>{review.approvedPlans} Läufe</strong>
     <small>Aus GARMIN_AI</small></div>
    <div><span>Plausibel zugeordnet</span><strong>{review.matchedCount} Läufe</strong>
     <small>Startzeit + Ablauf geprüft</small></div>
   </div>}
   {ready&&review.examples.length>0&&<div className="wpa-matches">
    <strong>Vergleichbare Coach-Einheiten</strong>
    {review.examples.map(item=><p key={item.date+'-'+item.title}>
     <span>{dateLabel(item.date)} · {item.title}</span>
     <span>{item.plannedMinutes} Min. geplant / {item.actualMinutes} Min. Garmin
      {' · '}{item.deltaMinutes>0?'+':''}{item.deltaMinutes} Min.</span>
    </p>)}
   </div>}
   <div className="wpa-next"><span>WAS BEDEUTET DAS FÜR DIESE WOCHE?</span>
    <p>{review.next}</p>
   </div>
   <p className="wpa-caution">Eine plausible Zuordnung ist kein Beweis für identische
    Intervalle oder Intensität. Nicht zugeordnete Einheiten gelten nicht automatisch
    als ausgefallen. Der Coach passt höchstens einen noch offenen Vorschlag an –
    nur nach deiner Freigabe wird daraus ein Entwurf.</p>
   <button type="button" className="wpa-open" onClick={onCalendar}>
    <Icon name="calendar-days"/> Kalender und Einheiten prüfen <Icon name="arrow-up-right"/>
   </button>
  </div>
 </details>
}

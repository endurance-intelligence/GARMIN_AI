import {useMemo} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {analyzeCoachFourWeeks} from '../lib/coachFourWeeks.mjs'
import '../styles/coach-four-weeks.css'

const dateLabel=(s:string)=>s.slice(8,10)+'.'+s.slice(5,7)+'.'
const num=(n:number|null)=>n===null?'–':n.toLocaleString('de-DE',{maximumFractionDigits:1})
export function CoachFourWeekCard({today,snapshot}:{
 today:string;snapshot:CoachSnapshot
}){
 const review=useMemo(()=>analyzeCoachFourWeeks({
  today,boards:snapshot.boards,plans:snapshot.plans,life:snapshot.life
 }),[today,snapshot])
 const maxKm=Math.max(1,...review.weeks.map(w=>w.distanceKm??0))
 return <details className="cfw-root" aria-label="Vier abgeschlossene Trainingswochen mit Entscheidungen und Garmin-Bewertungen">
  <summary className="cfw-summary">
   <span className="cfw-visual" aria-hidden="true">▥</span>
   <span className="cfw-title">
    <small>COACH · 4 ABGESCHLOSSENE WOCHEN</small>
    <strong>Welche Entscheidungen haben zu echten Einheiten geführt?</strong>
    <span>{review.completeWeeks} von 4 Wochen geladen · {review.totalRuns===null?
     'Garmin-Läufe nicht verfügbar':review.totalRuns+' Garmin-Läufe'} ·
     {' '}{review.totalRated===null?'Feedback fehlt':review.totalRated+' Bewertungen'}</span>
   </span>
   <span className="cfw-chevron" aria-hidden="true">⌄</span>
  </summary>
  <div className="cfw-body">
   <p className="cfw-description">Hier zählen wir drei Dinge bewusst getrennt:
    deine im Coach gespeicherten Entscheidungen, freigegebene Kalender-Laufpläne und
    tatsächlich aufgezeichnete Garmin-Läufe. Ein Klick auf „Annehmen“ ist kein
    Beleg für absolvierte Kilometer.</p>
   {review.status==='partial'||review.status==='unavailable'?
    <p role="status" className="cfw-caution">Die Historie ist teilweise unvollständig.
     Fehlende Einträge werden nicht als ausgelassene Trainingseinheiten gezählt.</p>:null}
   <div className="cfw-grid" role="list">
    {review.weeks.map(w=><article className="cfw-week" key={w.start} role="listitem">
     <header><strong>{dateLabel(w.start)} – {dateLabel(w.end)}</strong>
      <small>{w.available?'Garmin-Woche':'Daten fehlen'}</small></header>
     {!w.available?<p className="cfw-muted">Keine Wochenübersicht verfügbar.</p>:<>
      <div className="cfw-distance"><span>Garmin-Läufe: {w.runs}</span>
       <strong>{w.distanceKm===null?'km unvollständig':num(w.distanceKm)+' km'}</strong></div>
      {w.distanceKm!==null&&<div className="cfw-bar" role="img"
       aria-label={num(w.distanceKm)+' Laufkilometer in dieser Woche'}>
       <span style={{width:(w.distanceKm/maxKm*100)+'%'}}/></div>}
      <p><strong>Coach-Entscheidungen</strong> {w.accepted} angenommen · {w.declined} abgelehnt</p>
      <p><strong>Freigegebene Laufpläne</strong> {w.approved===null?'nicht vollständig abrufbar':
       w.approved+' Pläne · '+w.matched+' zeitlich plausibel zugeordnet'}</p>
      <p><strong>Garmin-Feedback</strong> {w.rated} bewertet
       {' · '}{w.hard} sehr hart / schwaches Gefühl</p>
     </>}
    </article>)}
   </div>
   <div className={'cfw-next'+(review.qualityCaution?' is-caution':'')}>
    <strong>{review.title}</strong>
    <p>{review.explanation}</p>
    <p>{review.suggestion}</p>
   </div>
   <p className="cfw-disclaimer">Nur gemessene Garmin-Werte. RPE und Gefühl
    werden direkt aus Garmin übernommen; fehlende Bewertungen bleiben unbekannt.
    Eine zeitliche Zuordnung belegt nicht die Durchführung identischer Workout-Schritte.
    Bereits gespeicherte Entscheidungen können aus älteren Versionen der App fehlen.
    Keine automatische Garmin- oder Kalenderänderung, keine künstlichen Fitness-Scores.</p>
  </div>
 </details>
}

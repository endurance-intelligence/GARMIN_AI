import {useMemo} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {buildCoachMemory} from '../lib/coachMemory.mjs'
import '../styles/coach-four-weeks.css'

const date=(s:string)=>s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4)
const stateLabel={draft:'Entwurf',pending:'Freigegeben',confirmed:'Bestätigt',cancelled:'Abgebrochen'}
export function CoachMemoryCard({today,snapshot}:{today:string;snapshot:CoachSnapshot}){
 const memory=useMemo(()=>buildCoachMemory({today,snapshot}),[today,snapshot])
 return <details className="cfw-root" aria-label="Coach-Gedächtnis">
  <summary className="cfw-summary">
   <span className="cfw-visual" aria-hidden="true">↶</span>
   <span className="cfw-title"><small>COACH · GEDÄCHTNIS</small>
    <strong>Was haben wir entschieden – und was ist daraus geworden?</strong>
    <span>{memory.status==='unavailable'?'Historie nicht verfügbar':
     memory.totalEntries+' gespeicherte Coach-Workouts · '+memory.totalDecisions+' Tagesentscheidungen'}</span>
   </span><span className="cfw-chevron" aria-hidden="true">⌄</span>
  </summary>
  <div className="cfw-body">
   <p className="cfw-description">Gespeicherte Coach-Empfehlungen, persönliche Freigaben und echte Garmin-Ergebnisse.
    Keine nachträglich erfundenen Begründungen oder Erfolgsquoten.</p>
   {memory.historyFrom&&<p className="cfw-description">Geladene Planhistorie ab {date(memory.historyFrom)}.
    Garmin-Ergebnisse nur für geladene Wochen; jeweils bis zu zwölf jüngste Einträge.</p>}
   {memory.status==='unavailable'?<p className="cfw-caution">Keine vollständige Planliste verfügbar.</p>:
    memory.entries.length===0?<p className="cfw-muted">Noch keine strukturierten Coach-Workouts in der geladenen Historie.</p>:
    <div className="cfw-grid">{memory.entries.map(entry=><article className="cfw-week" key={entry.id}>
     <header><strong>{date(entry.date)} · {entry.title}</strong><small>{stateLabel[entry.state]}</small></header>
     <p><strong>Empfehlung</strong>{entry.plannedMinutes===null?'Dauer nicht belegbar':entry.plannedMinutes+' Min. geplant'}</p>
     <p><strong>Ursprüngliche Coach-Begründung</strong>{entry.reason||'Damals nicht gespeichert.'}</p>
     <p><strong>Ergebnis</strong>{entry.outcome==='matched'&&entry.actual?
      (entry.actual.minutes===null?'Dauer fehlt':entry.actual.minutes+' Min. in Garmin')+
      (entry.actual.rpe===null?' · RPE fehlt':' · RPE '+entry.actual.rpe+'/10')+
      (entry.actual.feeling?' · Gefühl: '+entry.actual.feeling:''):
      entry.outcome==='draft'?'Entwurf ist kein absolviertes Training.':
      entry.outcome==='cancelled'?'Plan wurde abgebrochen.':
      entry.outcome==='unavailable'?'Garmin-Historie für diesen Tag nicht verfügbar.':
      'Keine eindeutige Garmin-Zuordnung. Kein Trainingsausfall unterstellt.'}</p>
     {entry.outcome==='matched'&&<p className="cfw-muted">Zeitlich plausibler Abgleich, kein Beweis gleicher Intensität oder Wirksamkeit.</p>}
    </article>)}</div>}
   <div className="cfw-next">
    <strong>Deine gespeicherten Tagesentscheidungen</strong>
    <p>Diese sind keine Workout-Freigaben und belegen keine absolvierte Einheit.</p>
    {memory.decisions.length===0?<p>Keine gespeicherten Tagesentscheidungen verfügbar.</p>:
     memory.decisions.map(d=><p key={d.date}>{date(d.date)} · {d.choice==='accepted'?'Angenommen':'Abgelehnt'}</p>)}
   </div>
   <p className="cfw-disclaimer">Die aktuelle Historie ist begrenzt. Ältere und fehlende Daten bleiben unbekannt.
    Die gespeicherte Begründung ist ein Auszug und dient dem Rückblick, nicht der automatischen Trainingsfreigabe.</p>
  </div>
 </details>
}

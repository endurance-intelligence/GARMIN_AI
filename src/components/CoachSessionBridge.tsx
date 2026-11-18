import {useMemo} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {buildCoachSessionBridge} from '../lib/coachSessionBridge.mjs'
import {Icon} from './Icon'
import '../styles/coach-session-bridge.css'

const labelDate=(date:string)=>date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4)
const time=(date:string)=>date.replace('T',' ').slice(11,16)
const fmt=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const matchLabel=(state:string)=>state==='matched'?'Mit Coach-Plan abgeglichen':
 state==='no-plan'?'Freier Lauf · kein Coach-Plan':
 state==='ambiguous'?'Zuordnung unklar':
 state==='possible'?'Gleiches Datum · Startzeit abweichend':
 state==='unsupported'?'Plan nicht zeitbasiert':
 'Keine sichere Zuordnung'

export function CoachSessionBridge({snapshot,today,onOpenSession}:{
 snapshot:CoachSnapshot;today:string;onOpenSession:(activityId:string)=>void
}){
 const overview=useMemo(()=>buildCoachSessionBridge({
  boards:snapshot.boards,plans:snapshot.plans.entries,today,limit:4
 }),[snapshot,today])
 if(overview.status==='unavailable')return <section className="csb-root" aria-label="Coach und Session Daten">
  <p className="csb-info">Garmin-Einheiten oder Trainingsplan nicht vollständig verfügbar.
   Kein Plan-Ist-Ergebnis ohne Daten.</p>
 </section>
 return <section className="csb-root" aria-label="Deine letzten Garmin-Läufe im Coach und Session Analyst">
  <div className="csb-heading">
   <div><span className="csb-kicker">COACH ↔ SESSION ANALYST</span>
    <h2>Deine letzten Läufe.</h2>
    <p>Dieselben Garmin-Daten und dieselbe Zuordnungslogik wie in der Analyse.</p></div>
   <span className="csb-count">{overview.status==='ready'?
    overview.matchedCount+' / '+overview.totalRuns+' zugeordnet':'Keine Läufe'}</span>
  </div>
  {overview.status==='empty'?<p className="csb-info">
   Keine Garmin-Läufe im geladenen Zeitraum. Keine ausgefallenen Einheiten unterstellt.
  </p>:<div className="csb-list">{overview.items.map(item=>{
   const matched=item.match.status==='matched'&&item.match.plan
   const plan=matched?item.match.plan:null
   return <article className="csb-item" key={item.id}>
    <div className="csb-top">
     <span>{labelDate(item.date)} · {time(item.date)} Uhr</span>
     <span className={matched?'csb-tag is-matched':'csb-tag'}>{matchLabel(item.match.status)}</span>
    </div>
    <strong className="csb-title">{item.title}</strong>
    <div className="csb-stats">
     <span>{item.distanceKm===null?'km fehlen':fmt(item.distanceKm)+' km'}</span>
     <span>{item.durationMinutes===null?'Dauer fehlt':item.durationMinutes+' Min.'}</span>
     {item.rpe!==null&&<span>Garmin-RPE {item.rpe}/10</span>}
     {item.feeling&&<span>Gefühl: {item.feeling}</span>}
    </div>
    {plan?<p className="csb-plan">
     <strong>{plan.title}</strong> · {plan.plannedMinutes} Min. geplant
     {plan.actualMinutes!==null?' / '+plan.actualMinutes+' Min. gemessen':''}.
     {' '}Nur zeitlich plausibel – kein Beweis gleicher Intervalle oder Intensität.
    </p>:item.match.status==='no-plan'?<p className="csb-subtle">
     Kein zugehöriges freigegebenes Coach-Workout gefunden. Das ist keine ausgelassene Einheit.
    </p>:<p className="csb-subtle">{item.match.reason}</p>}
    <button type="button" className="csb-open" onClick={()=>onOpenSession(item.id)}>
     <Icon name="activity"/> In Session Analyst öffnen <Icon name="arrow-up-right"/>
    </button>
   </article>
  })}</div>}
  <p className="csb-foot">Nur echte Garmin-Einheiten aus dem geladenen Kalenderzeitraum.
   Keine automatische Trainingsbewertung, Planänderung oder zusätzliche RPE-Eingabe.
   Eine Zuordnung erfordert einen freigegebenen, zeitbasierten Coach-Plan mit passender Startzeit.</p>
 </section>
}

import {analyzeGoalProgress} from '../lib/goalProgress.mjs'
import type {GoalProgressPillar} from '../lib/goalProgress.mjs'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {Icon} from './Icon'
import '../styles/goal-progress.css'

const number=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const short=(d:string)=>d.slice(8,10)+'.'+d.slice(5,7)+'.'
const dateRange=(a:string,b:string)=>short(a)+' – '+short(b)
const evidenceLabel=(v:GoalProgressPillar['evidence'])=>
 v==='documented'?'Garmin belegt':v==='limited'?'Daten begrenzt':'Noch nicht nachweisbar'

export function GoalProgressCard({today,snapshot,onRacePrep}:{
 today:string;snapshot:CoachSnapshot;onRacePrep:()=>void
}){
 const progress=analyzeGoalProgress({
  today,goal:snapshot.goal,boards:snapshot.boards,health:snapshot.health,racePortfolio:snapshot.racePortfolio
 })
 const full=progress.status==='ready'
 const finiteKm=progress.weeks.filter(w=>w.km!==null).map(w=>w.km as number)
 const scale=Math.max(1,...finiteKm)
 return <section className="gpg-root" aria-label="Nachweisbarer Trainingsfortschritt zum Hauptziel">
  <div className="gpg-head">
   <div className="gpg-title">
    <span className="gpg-eyebrow"><Icon name="target"/> FORTSCHRITT ZUM ZIEL / GARMIN</span>
    <h3>Was du für dein Rennen schon getan hast.</h3>
    <p>{progress.raceName?
     progress.raceName+' · '+progress.kind+' · '+progress.evidenceLabel:
     'Lege zuerst dein Hauptziel fest. Dann zeigt dir der Coach die belegten Trainingsfortschritte.'}</p>
   </div>
   <span className="gpg-window">{dateRange(progress.window.start,progress.window.end)}
    <small>4 abgeschlossene Wochen</small>
   </span>
  </div>
  {progress.status!=='missing-goal'&&<>
   <div className="gpg-next">
    <span><Icon name="compass"/> NÄCHSTER SINNVOLLER SCHRITT</span>
    <p>{progress.next}</p>
   </div>
   <div className="gpg-metrics">
    <div><span>Laufumfang</span><strong>{progress.totalKm===null?'—':number(progress.totalKm)+' km'}</strong>
     <small>{progress.totalKm===null?'Noch nicht vollständig':'Vier volle Wochen'}</small></div>
    <div><span>Regelmäßigkeit</span>
     <strong>{progress.activeWeeks===null?'—':progress.activeWeeks+' von 4'}</strong>
     <small>Wochen mit Läufen</small></div>
    <div><span>Längste Einheit</span>
     <strong>{progress.longest?progress.longest.minutes+' Min.':'—'}</strong>
     <small>{progress.longest?.distanceKm!==null&&progress.longest?
      number(progress.longest.distanceKm)+' km · Garmin':'Dauer nicht dokumentiert'}</small></div>
   </div>
   <div className="gpg-weekly" aria-label="Laufkilometer in vier abgeschlossenen Kalenderwochen">
    {progress.weeks.map(w=><div className="gpg-week" key={w.start}>
     <span>{short(w.start)}</span>
     <div className="gpg-track" aria-hidden="true">
      {w.km!==null&&<div className="gpg-fill" style={{width:w.km===0?'0%':Math.max(2,w.km/scale*100)+'%'}}/>}
     </div>
     <strong>{w.km===null?'Keine Angabe':number(w.km)+' km'}</strong>
    </div>)}
    <p>Balken zeigen nur die tatsächlich erfassten Wochenkilometer – keinen Fitnesswert.</p>
   </div>
   <details className="gpg-details">
    <summary>Was ist bereits belegt – und was fehlt noch? <Icon name="chevron-down"/></summary>
    <div className="gpg-pillars">
     {progress.pillars.map(p=><article key={p.id} className="gpg-pillar">
      <div><strong>{p.title}</strong><span>{evidenceLabel(p.evidence)}</span></div>
      <p>{p.summary}</p><small>{p.detail}</small>
     </article>)}
    </div>
    <div className="gpg-source">
     <strong>Datenquelle:</strong> {progress.source}.
     {full?' Alle vier Wochen sind aus der vollständigen Garmin-Historie abrufbar.':
      ' Die Historie ist noch nicht vollständig oder einzelne Wochen fehlen.'}
     <p>{progress.note}</p>
    </div>
    <button type="button" className="gpg-raceprep" onClick={onRacePrep}>
     <Icon name="flag"/> Rennstrategie und Verpflegung in Race Prep <Icon name="arrow-up-right"/>
    </button>
   </details>
  </>}
 </section>
}

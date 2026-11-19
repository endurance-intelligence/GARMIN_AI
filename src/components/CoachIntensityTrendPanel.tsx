import type {GarminIntensityTrend} from '../lib/coachIntensityTrend.mjs'
import '../styles/coach-intensity-trend.css'

const min=(seconds:number)=>Math.round(seconds/60).toLocaleString('de-DE')+' Min.'
const pct=(value:number|null)=>value===null?'–':
 value.toLocaleString('de-DE',{maximumFractionDigits:1})+' %'
const signed=(value:number)=>(value>0?'+':'')+
 value.toLocaleString('de-DE',{maximumFractionDigits:1})+' Pp.'
const phaseGuidance:Record<string,string>={
 base:'Grundlagenphase: Die bisherige Geräte-HF-Verteilung ist ein Rückblick. Sie legt keinen Zielpuls und keine Trainingsquote fest.',
 build:'Aufbauphase: Veränderungen in Garmin-HF-Zonen nur gemeinsam mit Umfang, Garmin-RPE und Erholung beurteilen.',
 specific:'Spezifische Vorbereitung: Die HF-Verteilung allein sagt nicht, ob Wettkampftempo oder lange Läufe passend waren.',
 peak:'Letzter Trainingsblock: Keine Intensität aus historischen Zonenanteilen nachholen.',
 taper:'Tapering: Frische für den Wettkampf ist wichtiger als jede historische Zonenquote.',
 race:'Renntag: Keine zusätzliche Trainingseinheit aus einem historischen Zonenvergleich ableiten.',
 recovery:'Regeneration: Die Zeit-in-Zone-Bilanz ist keine Freigabe für den Wiedereinstieg.',
 expired:'Das Ziel liegt zurück. Die Historie wird nicht als neues Trainingsziel umgedeutet.'
}
const colorClass=['low','middle','upper']
export function CoachIntensityTrendPanel({data}:{data:GarminIntensityTrend}){
 return <section className="cit-root" aria-label="Intensitätsentwicklung und aktuelle Wettkampfphase">
  <div className="cit-head">
   <div><small>COACH INTELLIGENCE · VERGLEICH MIT DEINEM ZIEL</small>
    <strong>Wie verändert sich deine Garmin-HF-Zeit?</strong>
    <p>Vier Wochen gegen die vier davor. Bei zwölf Wochen zusätzlich ein älterer Vergleichsblock.</p>
   </div>
  </div>
  {data.goal?<div className="cit-goal">
   <span>DEIN HAUPTZIEL</span>
   <strong>{data.goal.name}</strong>
   <small>{data.goal.raceDate.split('-').reverse().join('.')} · Aktuelle Phase: {data.goal.phaseLabel}</small>
   <p>{phaseGuidance[data.goal.phase||'']||
    'Dein Ziel liefert Kontext, aber keine automatische Intensitätsvorgabe.'}</p>
  </div>:<p className="cit-no-goal">
   Noch kein aktuelles Hauptziel mit gültigem Datum hinterlegt.
   Der Verlauf bleibt rein beschreibend.</p>}
  <div className="cit-blocks" role="list" aria-label="Garmin-HF-Anteile je Vierwochenblock">
   {data.blocks.map(block=><article className={'cit-block'+(!block.ready?' cit-incomplete':'')}
    key={block.index} role="listitem">
    <div className="cit-block-header">
     <strong>{block.label}</strong>
     <span>{block.receivedWeeks}/4 Wochen · {block.measuredActivities}/{block.activities} Läufe mit HF-Zeit</span>
    </div>
    {block.bands&&block.measuredSeconds>0?<div className="cit-graphic">
     <div className="cit-bar" role="img"
      aria-label={block.bands.map(b=>b.label+': '+pct(b.share)).join(', ')}>
      {block.bands.map((band,index)=><span key={band.key}
       className={'cit-segment '+colorClass[index]}
       style={{width:band.share===null?'0%':band.share+'%'}}/>)}
     </div>
     <div className="cit-legend">
      {block.bands.map((band,index)=><span key={band.key}>
       <i className={colorClass[index]}/>{band.label} <strong>{pct(band.share)}</strong>
       <small> · {min(band.seconds)}</small>
      </span>)}
     </div>
     <small className="cit-measured">Gemessen: {min(block.measuredSeconds)} ·
      Aktivitätsabdeckung: {pct(block.activityCoverage)} ·
      HF-Zeitabdeckung: {pct(block.recordingCoverage)}</small>
    </div>:<p className="cit-empty">Keine belastbare Garmin-FIT-Zonenbilanz für diesen Block.</p>}
    {!block.ready&&<p className="cit-reason">{block.reason}</p>}
   </article>)}
  </div>
  {data.comparable&&data.changes?<div className="cit-deltas" aria-label="Veränderung in Prozentpunkten">
   <strong>{data.title}</strong>
   <div>
    <span>Unter Z1 bis Z2 <b>{signed(data.changes.low)}</b></span>
    <span>Garmin Z3 <b>{signed(data.changes.middle)}</b></span>
    <span>Garmin Z4–Z5 + darüber <b>{signed(data.changes.upper)}</b></span>
   </div>
   <p>{data.detail}</p>
  </div>:<div className="cit-no-comparison">
   <strong>{data.title}</strong><p>{data.detail}</p>
  </div>}
  {data.goal?.protected&&<p className="cit-protection">
   Wettkampf- oder Erholungsphase: Keine Trainingsintensität ergänzen, um eine Quote zu verändern.
  </p>}
  <p className="cit-disclaimer"><strong>Keine physiologische 80/20-Quote.</strong>
   Garmin Z1–Z5 sind Geräte-HF-Zonen und nicht individuell validierte LT1-/LT2-Grenzen.
   Beide Zeiträume werden mit den <strong>aktuell gespeicherten</strong> Garmin-Zonengrenzen
   rückwirkend verglichen. Änderungen können durch Training, Streckenprofil,
   Wetter, Messqualität oder veränderte Geräte-Zonen beeinflusst sein.
   Hier entstehen keine neuen Workouts und keine automatische Trainingsfreigabe.</p>
 </section>
}

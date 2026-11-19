import type {ThresholdReport} from '../lib/coachThresholds.mjs'
import '../styles/coach-threshold-report.css'

const minutes=(seconds:number)=>Math.round(seconds/60).toLocaleString('de-DE')+' Min.'
const fmt=(n:number|null)=>n===null?'–':n.toLocaleString('de-DE',{maximumFractionDigits:1})+' %'
const changed=(n:number)=>(n>0?'+':'')+n.toLocaleString('de-DE',{maximumFractionDigits:1})+' Pp.'
const categories=[
 {label:'Unter LT1',key:'low'},
 {label:'LT1 bis unter LT2',key:'mid'},
 {label:'Ab LT2',key:'high'}
]
export function CoachThresholdReport({report}:{report:ThresholdReport}){
 if(report.status==='no-calibration'||report.status==='invalid-calibration')return null
 return <section className="ctr-root" aria-label="Zeit in den persönlich dokumentierten LT1- und LT2-Schwellen">
  <div className="ctr-head">
   <small>TESTBASIERTE HF-ZEITBILANZ · NUR BEI GÜLTIGEM SCHWELLENPROFIL</small>
   <strong>Deine Schwellenbereiche im Lauftraining</strong>
   <p>Aufgezeichnete Garmin-FIT-Sekunden, nicht aus Durchschnittspuls oder RPE abgeleitet.</p>
  </div>
  <div className="ctr-thresholds">
   <span>LT1 <strong>{report.lt1} bpm</strong></span>
   <span>LT2 <strong>{report.lt2} bpm</strong></span>
   <span>{report.isLab?'Von dir dokumentierter Labortest':'Von dir dokumentierter Feldtest · Schätzwerte'}</span>
  </div>
  {report.status==='outdated'?<p className="ctr-warning" role="status">
   Der eingetragene Test ist älter als 18 Monate. Die FIT-HF-Zeit wird nicht mit
   möglicherweise veralteten Schwellen als aktuelle Intensitätsverteilung dargestellt.</p>:
   <>
    <div className="ctr-blocks" role="list">
     {report.blocks.map(block=><article role="listitem" key={block.index}
      className={'ctr-block'+(!block.ready?' is-partial':'')}>
      <div className="ctr-block-title">
       <strong>{block.label}</strong>
       <span>{block.receivedWeeks}/4 Wochen · {block.measuredActivities}/{block.activities} Läufe</span>
      </div>
      {block.shares&&block.measuredSeconds>0?<div className="ctr-bars">
       {categories.map((cat,i)=><div className="ctr-row" key={cat.key}>
        <span>{cat.label}</span>
        <div className="ctr-track"><span className={'ctr-fill '+cat.key}
         style={{width:(block.shares?.[i]||0)+'%'}}/></div>
        <strong>{fmt(block.shares?.[i]??null)}</strong>
        <small>{minutes(block.seconds?.[i]||0)}</small>
       </div>)}
      </div>:<p className="ctr-muted">Noch keine auswertbaren FIT-HF-Sekunden.</p>}
      <p className="ctr-sub">Gemessene Zeit: {minutes(block.measuredSeconds)} ·
       HF-Abdeckung: {fmt(block.recordingCoverage)} ·
       Läufe mit ausreichenden FIT-Werten: {fmt(block.activityCoverage)}</p>
      {!block.ready&&<p className="ctr-warning">{block.reason}</p>}
     </article>)}
    </div>
    {report.comparable&&report.changes?<div className="ctr-change">
     <strong>Veränderung gegenüber den vier Vorwochen</strong>
     <div>
      <span>Unter LT1 <b>{changed(report.changes.low)}</b></span>
      <span>Zwischen LT1 und LT2 <b>{changed(report.changes.middle)}</b></span>
      <span>Ab LT2 <b>{changed(report.changes.high)}</b></span>
     </div>
     <p>Der Vergleich beschreibt aufgezeichnete Herzfrequenzzeit.
      Er sagt allein nicht aus, ob das Training optimal war.</p>
    </div>:<p className="ctr-warning" role="status">
     Noch kein belastbarer Vergleich. Es werden nur vollständig zugeordnete
     Trainingsblöcke seit deinem Schwellentest gegenübergestellt.</p>}
   </>}
  <p className="ctr-caveat">{report.warning} Auch Testdaten ersetzen keine
   Prüfung der Tagesform. Herzfrequenz hat bei Intervallen einen zeitlichen Nachlauf;
   Pausen und Messlücken bleiben ausgeschlossen. Dies ist die zeitgewichtete
   Drei-Bereiche-Verteilung nach deinen eingetragenen Schwellen – <strong>keine feste 80/20-Trainingsvorgabe</strong> und keine automatische Änderung deiner Einheiten.</p>
 </section>
}

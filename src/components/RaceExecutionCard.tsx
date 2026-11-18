import {buildRaceExecution} from '../lib/raceExecution.mjs'
import {Icon} from './Icon'
import '../styles/race-execution.css'

type Input={distanceKm:number;courseMode:string;loopKm:number|null;
 movingMinutes:number|null;regularPauseMinutes:number|null;longStopEvery:number|null;
 longStopMinutes:number|null;paceSeconds:number|null;targetHours:number|null;
 carbsGPerHour:number|null;fluidMlPerHour:number|null;sodiumMgPerHour:number|null}
const fmt=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
export function RaceExecutionCard({input,saved,weightKg}:{input:Input;saved:boolean;weightKg?:number|null}){
 const data=buildRaceExecution(input)
 if(data.status!=='ready'||!data.estimate)return null
 return <details className="rex-root" open aria-label="Rennen nach Runden mit Zeit und Versorgung planen">
  <summary className="rex-summary">
   <span className="rex-icon"><Icon name="timer"/></span>
   <span className="rex-summary-text">
    <small>RENNABLAUF · AUS DEINEN ANGABEN</small>
    <strong>{data.estimate.formattedTotal} · Zeitplan &amp; Verpflegung</strong>
    <span>{saved?'Zuletzt gespeicherte Werte – Änderungen erst nach Speichern verbindlich':
     'Noch nicht gespeichert · nur eine Vorschau'}</span>
   </span>
   <Icon name="chevron-down"/>
  </summary>
  <div className="rex-body">
   {data.target&&<div className={'rex-target is-'+data.target.status}>
    <strong>{data.target.text}</strong>
    <small>Abgleich mit deinem selbst gesetzten Ziel: {Math.floor(data.target.minutes/60)} Std.
     {data.target.minutes%60>0?' '+data.target.minutes%60+' Min.':''}.
     Kein Versprechen, dass das Tempo tatsächlich möglich ist.</small>
   </div>}
   {data.nutrition&&<div className="rex-fuel">
    <span className="rex-kicker">GESAMTBEDARF NACH DEINEN STUNDENWERTEN</span>
    <div className="rex-fuel-items">
     {data.nutrition.carbsG!==null&&<div><strong>{fmt(data.nutrition.carbsG)} g</strong>
      <small>Kohlenhydrate</small></div>}
     {data.nutrition.carbsG!==null&&<div><strong>{fmt(data.nutrition.carbsG*4)} kcal</strong>
      <small>Energie aus geplanten Kohlenhydraten</small></div>}
     {data.nutrition.fluidMl!==null&&<div><strong>{fmt(data.nutrition.fluidMl/1000)} l</strong>
      <small>Getränke</small></div>}
     {data.nutrition.sodiumMg!==null&&<div><strong>{fmt(data.nutrition.sodiumMg)} mg</strong>
      <small>Natrium</small></div>}
    </div>
    {weightKg!=null&&weightKg>=30&&weightKg<=250&&<p>
     Grober Laufenergie-Richtwert bei {fmt(weightKg)} kg: ca. {fmt(Math.round(weightKg*input.distanceKm))} kcal
     (1 kcal/kg/km). Das ist <strong>kein</strong> Garmin-Messwert und nicht deine notwendige Verpflegungsmenge.
    </p>}
    <p>Nur aus geplanter Gesamtdauer × deinen Angaben pro Stunde berechnet.
     Pausen sind eingeschlossen; Versorgung, Verträglichkeit und tatsächliche Trinkmenge
     musst du im Rennen anpassen.</p>
   </div>}
   {input.courseMode==='laps'?<details className="rex-splits">
    <summary>Alle {data.checkpoints.length} Runden mit Ankunft, Pause und Weiterlauf anzeigen</summary>
    <div className="rex-table-wrap">
    <table className="rex-table">
     <thead><tr><th>Runde</th><th>km gesamt</th><th>Ankunft ab Start</th>
      <th>Pause</th><th>Weiter / Ziel</th></tr></thead>
     <tbody>{data.checkpoints.map(c=><tr key={c.index} className={c.longBreakMinutes>0?'is-long':''}>
      <td>{c.index}{c.finish?' · Ziel':''}</td>
      <td>{fmt(c.distanceKm)}</td><td>{c.arrivalText}</td>
      <td>{c.finish?'—':c.pauseMinutes+' Min.'+
       (c.longBreakMinutes>0?' (inkl. langer Stopp)':'')}</td>
      <td>{c.departureText}</td>
     </tr>)}</tbody>
    </table>
   </div></details>:<p className="rex-point">Punkt-zu-Punkt: Gesamtzeit berechnet.
    Ohne gespeicherte Versorgungspunkte werden keine Zwischenstopps erfunden.</p>}
   {data.warning&&<p className="rex-tip">{data.warning}</p>}
   <p className="rex-foot">Zeiten sind relativ zum Start und enthalten keine reale
    Uhrzeit. Unterwegs zählen Wetter, Gelände, tatsächliche Pausen und
    Verpflegungsverträglichkeit. Die Tabelle ersetzt keine Rennentscheidung.</p>
  </div>
 </details>
}

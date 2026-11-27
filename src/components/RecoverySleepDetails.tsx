import {sanitizeSleep,sleepComposition} from '../lib/recoverySleep.mjs'
import {formatSleep} from '../lib/recoveryComparison'
import {Icon} from './Icon'
const stages=[['deepSeconds','Tiefschlaf','deep'],['lightSeconds','Leichtschlaf','light'],['remSeconds','REM','rem'],['awakeSeconds','Wach','awake']] as const
export function RecoverySleepDetails({value}:{value:unknown}){
 const data=sanitizeSleep(value),composition=sleepComposition(data)
 return <section className="co-sleep-detail" aria-label="Schlafqualität und Schlafphasen">
  <header><div><span className="co-eyebrow">DEINE LETZTE NACHT</span><h3><Icon name="moon"/> Schlafqualität</h3></div>{typeof data?.score==='number'&&<div className="co-sleep-score"><strong>{data.score}</strong><span>/ 100 · Garmin Sleep Score</span></div>}</header>
  {composition&&<div className="co-sleep-bar" role="img" aria-label="Anteile der geschätzten Schlafphasen und Wachzeit, keine zeitliche Abfolge">{stages.map(([key,label,tone])=><span key={key} className={'co-sleep-stage '+tone} style={{flexGrow:data?.[key]??0}} title={label+' '+formatSleep(data?.[key]??null)}/>)}</div>}
  <div className="co-sleep-legend">{stages.map(([key,label,tone])=><div key={key}><span className={'co-sleep-dot '+tone}/><span>{label}</span><strong>{formatSleep(data?.[key]??null)}</strong></div>)}</div>
  {typeof data?.sleepStress==='number'&&<p>Garmin-Schlafstress: {data.sleepStress} / 100</p>}
  {!data&&<p role="status">Schlafdetails noch nicht importiert oder von Garmin nicht verfügbar.</p>}
  <small>Geschätzte Phasen, keine Schlaflabor-Messung. {composition?'Balken zeigt gemessene Anteile, nicht den zeitlichen Verlauf.':'Keine vollständige Phasenverteilung verfügbar.'} Der Coach bewertet Schlafqualität zusammen mit Dauer und Verlauf.</small>
 </section>
}

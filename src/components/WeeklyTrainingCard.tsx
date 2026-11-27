import type {WeeklyBudget} from '../lib/weeklyTraining.mjs'
import {Icon} from './Icon'
import '../styles/weekly-training.css'
const fmt=(n:number|null)=>n===null?'–':n.toLocaleString('de-DE',{maximumFractionDigits:1})
const date=(s:string)=>s.slice(8,10)+'.'+s.slice(5,7)+'.'
export function WeeklyTrainingCard({budget}:{budget:WeeklyBudget|null|undefined}){
 if(!budget)return null
 const b=budget,scale=Math.max(1,b.target?.high??0,b.forecastKm??0)
 const parts=[{label:'Absolviert',km:b.actualKm??0,cls:'actual'},{label:'Freigegeben',km:b.approvedKm,cls:'approved'},{label:'Entwürfe',km:b.draftKm,cls:'draft'},{label:'Coach-Vorschläge',km:b.suggestedKm,cls:'suggested'}]
 const achieved=b.target&&b.actualKm!==null&&b.actualKm>=b.target.low
 const projected=b.target&&b.forecastKm!==null&&b.forecastKm>=b.target.low
 return <section className="wti-card" aria-label="Dein Laufumfang und Wochenziele">
  <header className="wti-header"><div><small>WEEKLY TRAINING INTELLIGENCE · {date(b.start)} – {date(b.end)}</small><h3>Dein Wochenziel</h3><span>{b.phaseLabel}</span></div><span className="wti-icon"><Icon name="target"/></span></header>
  <div className="wti-target"><div><small>LAUFKILOMETER · RICHTWERT</small><strong>{b.target?b.target.low+'–'+b.target.high:'Kein Kilometerziel'}{b.target&&<em> km</em>}</strong></div><span className={'wti-status '+(achieved?'is-positive':'')}>{!b.target?'Kein Umfangsdruck':achieved?'Unterer Richtwert erreicht':projected?'Im bekannten Plan erreichbar':'Laufumfang im Blick'}</span></div>
  {b.target&&b.actualKm!==null&&<div className="wti-meter" role="img" aria-label={'Absolviert '+fmt(b.actualKm)+' km, bekannte Wochenprognose '+fmt(b.forecastKm)+' km'+(b.target?', Richtwert '+b.target.low+' bis '+b.target.high+' km':'')}>
   {parts.map(p=><span key={p.cls} className={'wti-fill '+p.cls} style={{width:p.km/scale*100+'%'}}/>)}
   {b.target&&<span className="wti-marker" style={{left:Math.min(99,b.target.low/scale*100)+'%'}}/>}
  </div>}
  {b.target&&<div className="wti-legend">{parts.map(p=><span key={p.cls}><i className={p.cls}/>{p.label}</span>)}</div>}
  <div className="wti-kpis"><div><small>Absolviert</small><strong>{fmt(b.actualKm)} <em>km</em></strong></div><div><small>Bekannte Prognose</small><strong>{fmt(b.forecastKm)} <em>km</em></strong></div>{b.target&&<div><small>Bis zum unteren Richtwert</small><strong>{fmt(b.gapKm)} <em>km</em></strong></div>}</div>
  {(b.longRunMinutes!==null||(b.longestActualMinutes??0)>0||b.qualityPlanned>0||b.qualityCandidates>0||b.strengthTarget!==null||(b.strengthDays??0)>0||b.rowingTarget!==null||(b.rowingDays??0)>0)&&<div className="wti-goals">
   {(b.longRunMinutes!==null||(b.longestActualMinutes??0)>0)&&<div><Icon name="footprints"/><span><strong>{b.longRunMinutes!==null?'Langer Lauf':'Längster Lauf'}</strong><small>{b.longRunMinutes!==null?'Längste gemessene Einheit / Orientierung':'Tatsächlich absolviert'}</small></span><b>{fmt(b.longestActualMinutes)}{b.longRunMinutes!==null?' / '+b.longRunMinutes:''} Min.</b></div>}
   {(b.qualityPlanned>0||b.qualityCandidates>0||b.trackSlots?.length||b.qualityActual)&&<div><Icon name="zap"/><span><strong>Qualitätseinheiten</strong><small>{b.qualityCandidates>0?b.qualityCandidates+' mögliche Option(en) · ':''}{b.qualityOptions>0?'Obergrenze '+b.qualityOptions+' · keine Pflicht':'Gespeicherte Planung · Erholung prüfen'}</small></span><b>{b.qualityActual!==undefined?b.qualityActual+' absolviert · ':''}{b.qualityPlanned} geplant</b></div>}
   {(b.strengthTarget!==null||(b.strengthDays??0)>0)&&<div><Icon name="activity"/><span><strong>Stabi &amp; Mobility</strong><small>{b.strengthTarget!==null?'Absolvierte Tage / vorgesehene Tage':'Absolviert · ohne Wochenziel'}</small></span><b>{fmt(b.strengthDays)}{b.strengthTarget!==null?' / '+b.strengthTarget:' Tage'}</b></div>}
   {(b.rowingTarget!==null||(b.rowingDays??0)>0)&&<div><Icon name="waves"/><span><strong>Rudern</strong><small>{b.rowingTarget!==null?'Absolvierte Tage / vorgesehene Tage':'Absolviert · ohne Wochenziel'}</small></span><b>{fmt(b.rowingDays)}{b.rowingTarget!==null?' / '+b.rowingTarget:' Tage'}</b></div>}
  </div>}
  {b.trackSlots?.length&&<div className="wti-details"><p>{b.trackSlots.map(s=>date(s.date)+' ORC Track: '+({open:'offen',selected:'zugesagt',completed:'absolviert',saved:'geplant',skipped:'abgesagt',unavailable:'nicht verfügbar','past-unknown':'Teilnahme nicht belegt'} as Record<string,string>)[s.status]).join(' · ')}</p></div>}
  <div className="wti-next"><Icon name="message-circle"/><div><strong>{!b.target?'Erholung und Verträglichkeit zuerst':b.gapKm!==null&&b.gapKm>0?'Laufspezifische Reize sichern':'Wochenziel im Blick behalten'}</strong><p>{b.focus} {b.target&&b.gapKm!==null&&b.gapKm>0?'Rudern und Radfahren dürfen einen offenen Lauf nicht verdrängen, wenn dadurch der untere Richtwert unterschritten wird. Keine fehlenden Kilometer nachholen.':''}</p></div></div>
  <details className="wti-details"><summary>Wie entsteht die Prognose?</summary><p>Nur gemessene Garmin-Laufkilometer zählen als absolviert. Für zeitbasierte lockere Coach-Läufe wird aus mindestens drei jüngeren subjektiv lockeren Läufen eine vorsichtige Pace geschätzt{b.paceSeconds!==null?' ('+Math.floor(b.paceSeconds/60)+':'+String(b.paceSeconds%60).padStart(2,'0')+' min/km)':''}. Entwürfe und offene Vorschläge sind nur bedingte Prognosen. {b.unknown>0?b.unknown+' mögliche Termine oder Tage ohne quantifizierbare Laufdistanz sind nicht eingerechnet. ':''}Rudern, Radfahren und Hiking werden nie in Laufkilometer umgerechnet.</p><p>Der Richtwert orientiert sich am langfristigen Fahrplan und an der dokumentierten Laufbasis. Rennen, Erholung und Warnsignale haben Vorrang. Eine Unterschreitung ist kein Auftrag, Kilometer nachzuholen.</p></details>
 </section>
}

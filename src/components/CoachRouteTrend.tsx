/** A small, read-only visualization of observational matched-route pace. */
export type RouteTrend =
 |{status:'not-gps';reason:string}
 |{status:'insufficient';reason:string;matchedRuns:number;spanDays:number;requiredRuns:number;
   excludedOutliers?:number}
 |{status:'ready';direction:'faster'|'slower'|'inconclusive';
   matchedRuns:number;spanDays:number;firstDate:string;lastDate:string;
   referenceHr:number;referenceRpe:number;olderPace:number;newerPace:number;
   deltaSecKm:number;medianSlopeSecPer90d:number;olderHr:number;newerHr:number;
   excludedOutliers:number;typicalScatterSecKm:number|null;
   olderRpe:number;newerRpe:number;
   series:{date:string;paceSecKm:number;averageHr:number;rpe:number}[]}

const pace=(n:number)=>{
  const s=Math.round(n)
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')
}
const reasonText:Record<string,string>={
  'few-easy-runs':'Noch nicht genügend lockere Läufe auf dieser bestätigten Strecke.',
  'few-comparable-runs':'Zu wenige Läufe mit ähnlichem Puls (±4 bpm) und Anstrengung (±1 RPE).',
  'short-period':'Der Beobachtungszeitraum ist noch kürzer als 90 Tage.',
  'too-few-months':'Die Läufe verteilen sich noch nicht auf mindestens drei Kalendermonate.',
  'time-windows-overlap':'Frühe und aktuelle Vergleichsläufe liegen noch zu dicht beieinander.',
  'load-drift':'Puls oder Anstrengung unterscheiden sich zwischen früher und heute zu stark.',
  'few-separated-pairs':'Es gibt noch nicht genügend zeitlich getrennte Laufpaare.',
  'pace-outliers':'Auffällige Einzelzeiten lassen derzeit keinen stabilen Vergleich zu.',
  'unstable-pace':'Zu viele ungewöhnliche Einzelzeiten für eine verlässliche Auswertung.'
}
const delta=(n:number)=>(n<0?'−':n>0?'+':'±')+Math.abs(Math.round(n))+' s/km'

function PaceLine({series}:{series:Extract<RouteTrend,{status:'ready'}>['series']}){
  if(series.length<2)return null
  const values=series.map(s=>s.paceSecKm)
  const minimum=Math.min(...values)-6,maximum=Math.max(...values)+6
  const minTime=Date.parse(series[0].date+'T12:00:00Z')
  const maxTime=Date.parse(series.at(-1)!.date+'T12:00:00Z')
  if(!Number.isFinite(minTime)||!Number.isFinite(maxTime)||maxTime<=minTime)return null
  const dots=series.map(p=>{
    const t=Date.parse(p.date+'T12:00:00Z')
    return {x:12+296*(t-minTime)/(maxTime-minTime),
      y:12+60*(p.paceSecKm-minimum)/(maximum-minimum)}
  })
  return <div className="crr-trend-plot">
    <svg viewBox="0 0 320 88" role="img"
      aria-label={'Tempoentwicklung aus '+series.length+' lockeren Läufen, chronologisch von links nach rechts'}>
      <line x1="12" y1="12" x2="308" y2="12" className="crr-trend-grid"/>
      <line x1="12" y1="42" x2="308" y2="42" className="crr-trend-grid"/>
      <line x1="12" y1="72" x2="308" y2="72" className="crr-trend-grid"/>
      <polyline className="crr-trend-path" fill="none"
        points={dots.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')}/>
      {dots.map((p,i)=><circle key={series[i].date+'-'+i}
        className="crr-trend-dot" cx={p.x} cy={p.y} r="2.8"/>)}
    </svg>
    <div className="crr-trend-plot-labels">
      <span>{series[0].date.slice(0,7)}</span>
      <span>Schneller ↑</span>
      <span>{series.at(-1)!.date.slice(0,7)}</span>
    </div>
  </div>
}

export function CoachRouteTrend({trend}:{trend:RouteTrend}){
  if(trend.status==='not-gps')
    return <div className="crr-trend crr-trend-pending">
      <strong>Langzeitverlauf</strong>
      <p>Erst nach GPS-Bestätigung mehrerer Läufe auf exakt dieser Strecke.</p>
    </div>
  if(trend.status==='insufficient')
    return <div className="crr-trend crr-trend-pending">
      <strong>Langzeitverlauf · noch keine belastbare Aussage</strong>
      <p>{reasonText[trend.reason]||'Noch nicht genügend vergleichbare Trainingsdaten.'}</p>
      <small>{trend.matchedRuns} vergleichbare Läufe · mindestens {trend.requiredRuns} benötigt
        {trend.spanDays>0&&' · '+trend.spanDays+' Tage erfasst'}
        {!!trend.excludedOutliers&&' · '+trend.excludedOutliers+' auffällige Läufe ausgeschlossen'}</small>
    </div>
  const verdict=trend.direction==='faster'?'Schneller bei ähnlichem Puls':
    trend.direction==='slower'?'Langsamer bei ähnlichem Puls':
    'Noch kein eindeutiger Tempotrend'
  return <div className="crr-trend">
    <div className="crr-trend-heading">
      <small>GPS-VERIFIZIERTER LANGZEITVERLAUF</small>
      <strong>{verdict}</strong>
    </div>
    <div className="crr-trend-kpis">
      <div><small>Früher · 2 Läufe</small><strong>{pace(trend.olderPace)}</strong><small>min/km</small></div>
      <div><small>Zuletzt · 2 Läufe</small><strong>{pace(trend.newerPace)}</strong><small>min/km</small></div>
      <div><small>Beobachtete Differenz</small><strong>{delta(trend.deltaSecKm)}</strong>
        <small>Median · kein Kausalnachweis</small></div>
    </div>
    <PaceLine series={trend.series}/>
    <p className="crr-trend-context">{trend.matchedRuns} lockere Läufe über {trend.spanDays} Tage ·
      {' '}Referenz-HF ca. {trend.referenceHr} bpm · RPE ca. {trend.referenceRpe} ·
      {' '}robuste Richtung: {trend.medianSlopeSecPer90d>0?'+':''}
      {trend.medianSlopeSecPer90d} s/km pro 90 Tage
      {trend.typicalScatterSecKm!==null&&' · typische Abweichung '+trend.typicalScatterSecKm+' s/km'}
      {trend.excludedOutliers>0&&' · '+trend.excludedOutliers+' auffällige Läufe ausgeschlossen'}</p>
    <p className="crr-trend-limits">Nur gleich verlaufende GPS-Strecken und ähnliche Belastung.
      Auffällige Einzelzeiten werden gesondert geprüft; das ist keine medizinische Aussage.
      Wetter, Untergrund, Ermüdung und Messfehler sind nicht herausgerechnet.
      Kein automatischer Eingriff in den Trainingsplan.</p>
  </div>
}

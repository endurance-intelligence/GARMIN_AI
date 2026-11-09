import {recoveryTrend} from '../lib/recoveryTrend'
import type {RecoveryDay,RecoveryMetric} from '../lib/recoveryComparison'

/** Decorative shape backed only by measured calendar days; missing days break the line. */
export function RecoverySparkline({history,metric,day,median,label}:{
 history:RecoveryDay[];metric:RecoveryMetric;day:string;
 median:number|null;label:string
}){
 const trend=recoveryTrend(history,metric,day,median)
 const last=[...trend.points].reverse().find(p=>p.y!==null)
 return <div className="co-sparkline-wrap">
  <svg viewBox="0 0 180 66" preserveAspectRatio="none" className="co-sparkline"
    role="img" aria-label={label+': gemessener Verlauf der letzten sieben Tage mit Lücken für fehlende Werte'+
     (median===null?'':'; gestrichelte Linie ist der Median der vorherigen 14 Tage')}>
    <line x1="7" y1="58" x2="173" y2="58" className="co-spark-axis"/>
    {trend.referenceY!==null&&<line x1="7" y1={trend.referenceY} x2="173" y2={trend.referenceY}
      className="co-spark-reference"/>}
    {trend.segments.map((path,i)=><g key={i}>
      <path d={path} className="co-spark-glow" fill="none"/>
      <path d={path} className="co-spark-line" fill="none"/>
    </g>)}
    {last?.y!==null&&last!==undefined&&<>
      <circle cx={last.x} cy={last.y} r="7" className="co-spark-ring"/>
      <circle cx={last.x} cy={last.y} r="3.2" className="co-spark-dot"/>
    </>}
  </svg>
  <div className="co-spark-scale">
   <span>vor 6 Tagen</span><span>heute</span>
  </div>
 </div>
}

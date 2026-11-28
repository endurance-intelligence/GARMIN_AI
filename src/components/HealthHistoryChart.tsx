import {shiftDay} from '../lib/healthOverview.mjs'
import type {HealthPoint} from '../lib/healthOverview.mjs'
export function HealthHistoryChart({points,end,days=28,label,unit}:{points:HealthPoint[];end:string;days?:number;label:string;unit:string}){
 const start=shiftDay(end,1-days),shown=points.filter(p=>p.date>=start&&p.date<=end)
 if(!shown.length)return <p>Keine Messungen im Zeitraum.</p>
 const low=Math.min(...shown.map(p=>p.value)),high=Math.max(...shown.map(p=>p.value))
 const pad=Math.max((high-low)*.15,unit==='kg'?.3:1)
 const x=(d:string)=>42+(Date.parse(d+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000/(days-1)*252
 const y=(n:number)=>10+(high+pad-n)/(high-low+2*pad)*84
 const fmt=(n:number)=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
 return <figure className="health-history-chart">
  <svg viewBox="0 0 310 120" role="img" aria-label={label+' · '+shown.length+' Messungen · '+fmt(low)+' bis '+fmt(high)+' '+unit}>
   {[high,low].map((n,i)=><g key={i}><line x1="42" x2="294" y1={y(n)} y2={y(n)} stroke="currentColor" strokeOpacity=".14"/>{(i===0||low!==high)&&<text x="36" y={y(n)+3} textAnchor="end" fontSize="9" fill="currentColor">{fmt(n)}</text>}</g>)}
   {shown.map(p=><circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="3.1" fill="var(--a, currentColor)"><title>{p.date}: {fmt(p.value)} {unit}</title></circle>)}
   <text x="42" y="114" fontSize="9" fill="currentColor">{start.slice(8)}.{start.slice(5,7)}.</text><text x="294" y="114" textAnchor="end" fontSize="9" fill="currentColor">{end.slice(8)}.{end.slice(5,7)}.</text>
  </svg><figcaption>{shown.length} tatsächliche Messungen · Fehlende Tage bleiben frei</figcaption>
 </figure>
}

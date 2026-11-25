import {normalizeGarminRpe} from './garminPerception.mjs'
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0
const format=(n,decimals=0)=>n.toLocaleString('de-DE',{maximumFractionDigits:decimals,minimumFractionDigits:decimals})
const clock=seconds=>{
 const whole=Math.round(seconds)
 return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0')
}
export function summarizeRunMetrics(activity){
 const a=activity||{}
 const d=positive(a.distanceM)?a.distanceM/1000:null
 const t=positive(a.durationS)?a.durationS:null
 const hr=positive(a.avgHr)&&a.avgHr>=35&&a.avgHr<=220?a.avgHr:null
 const rpe=normalizeGarminRpe(a.rpeRaw)
 const pace=d!==null&&t!==null?t/d:null
 const metric=(key,label,value,unit)=>({key,label,value:value===null?'–':value,unit:value===null?'':unit})
 return [
  metric('distance','DISTANZ',d===null?null:format(d,2),'km'),
  metric('duration','DAUER',t===null?null:clock(t),'min:s'),
  metric('pace','Ø PACE',pace===null||!Number.isFinite(pace)?null:clock(pace),'min/km'),
  metric('hr','Ø HF',hr===null?null:format(hr),'bpm'),
  metric('rpe','GEFÜHLTE ANSTRENGUNG',rpe===null?null:format(rpe),'/10')
 ]
}

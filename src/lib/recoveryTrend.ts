/**
 * Non-scoring Garmin recovery visualization.
 * Exact seven calendar days with gaps preserved; never interpolate missing data.
 * A dashed comparison line represents the *prior* 14-day median if available.
 */
import {calendarDayOffset} from './recoveryComparison.ts'
import type {RecoveryDay,RecoveryMetric} from './recoveryComparison'

export type RecoveryTrendPoint={
 day:string;x:number;y:number|null;value:number|null
}
export type RecoveryTrend={
 points:RecoveryTrendPoint[]
 segments:string[]
 referenceY:number|null
 validCount:number
}
const RANGES:Record<RecoveryMetric,[number,number]>={
 sleep_seconds:[3*3600,16*3600],
 hrv_ms:[10,250],
 resting_heart_rate:[25,110]
}
function validValue(v:unknown,[min,max]:[number,number]):number|null{
 return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null
}
export function recoveryTrend(
 days:RecoveryDay[],metric:RecoveryMetric,anchor:string,baseline:number|null
):RecoveryTrend{
 const bounds=RANGES[metric]
 const dates=Array.from({length:7},(_,i)=>calendarDayOffset(anchor,i-6))
 const indexed=new Map(days.map(d=>[d.metric_date,d]))
 const values=dates.map(date=>validValue(indexed.get(date)?.[metric],bounds))
 const ref=validValue(baseline,bounds)
 const usable=[...values.filter((v):v is number=>v!==null),...(ref===null?[]:[ref])]
 if(!usable.length)return {
  points:dates.map((day,i)=>({day,x:7+i*(166/6),y:null,value:null})),
  segments:[],referenceY:null,validCount:0
 }
 const lower=Math.min(...usable),upper=Math.max(...usable)
 const minimumSpread=metric==='sleep_seconds'?3600:metric==='hrv_ms'?10:5
 const padded=Math.max(upper-lower,minimumSpread)*0.17
 const low=lower-padded,high=upper+padded
 const y=(v:number)=>Number((56-(v-low)/(high-low)*44).toFixed(2))
 const points=dates.map((day,i)=>({
  day,x:Number((7+i*(166/6)).toFixed(2)),
  y:values[i]===null?null:y(values[i]),value:values[i]
 }))
 const segments:string[]=[]
 let path=''
 for(const p of points){
  if(p.y===null){if(path)segments.push(path);path='';continue}
  path+=(path?' L':'M')+p.x+' '+p.y
 }
 if(path)segments.push(path)
 return {
  points,segments,
  referenceY:ref===null?null:y(ref),
  validCount:values.filter(x=>x!==null).length
 }
}

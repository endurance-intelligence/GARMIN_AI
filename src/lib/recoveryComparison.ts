/** GARMIN_AI – descriptive recovery context, never a readiness score.
 * Every comparator is an observed median of the 14 calendar days PRIOR to
 * the latest dated Garmin measurement, never an invented healthy baseline.
 */
export type RecoveryDay={
 metric_date:string;hrv_ms:number|null;resting_heart_rate:number|null;
 sleep_seconds:number|null;stress_avg?:number|null;body_battery_max?:number|null
}
export type RecoveryMetric='sleep_seconds'|'hrv_ms'|'resting_heart_rate'
export type RecoveryComparison={
 metric:RecoveryMetric;latest:number|null;median:number|null;
 difference:number|null;sampleCount:number
}
const DAY_MS=86400000
const LIMITS:Record<RecoveryMetric,[number,number]>={
 sleep_seconds:[3*3600,16*3600],hrv_ms:[10,250],resting_heart_rate:[25,110]
}
const validDay=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&
 !Number.isNaN(Date.parse(date+'T12:00:00Z'))&&
 new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date
export function calendarDayOffset(date:string,delta:number){
 if(!validDay(date))return ''
 return new Date(Date.parse(date+'T12:00:00Z')+delta*DAY_MS).toISOString().slice(0,10)
}
export function recoveryMedian(values:number[]):number|null{
 if(!values.length)return null
 const sorted=[...values].sort((a,b)=>a-b)
 const mid=Math.floor(sorted.length/2)
 return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2
}
export function interpretRecovery(history:RecoveryDay[],latestDay:string){
 const current=history.find(x=>x.metric_date===latestDay)
 if(!current||!validDay(latestDay))return null
 const earliest=calendarDayOffset(latestDay,-14)
 const before=history.filter(x=>validDay(x.metric_date)&&
   x.metric_date>=earliest&&x.metric_date<latestDay)
 const keys:RecoveryMetric[]=['sleep_seconds','hrv_ms','resting_heart_rate']
 const metrics=keys.map(metric=>{
   const [min,max]=LIMITS[metric]
   const observed=before.map(d=>d[metric]).filter((v):v is number=>
    typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max)
   const measured=current[metric]
   const latest=typeof measured==='number'&&Number.isFinite(measured)&&
     measured>=min&&measured<=max?measured:null
   const median=observed.length>=7?recoveryMedian(observed):null
   return {
    metric,latest,median,sampleCount:observed.length,
    difference:latest!==null&&median!==null?latest-median:null
   } satisfies RecoveryComparison
 })
 const [sleep,hrv,rhr]=metrics
 const clauses:string[]=[]
 if(sleep.difference!==null){
  const minutes=Math.round(sleep.difference/60)
  clauses.push(minutes===0?'Schlafdauer nahe dem jüngsten Median':
   'Schlafdauer '+(minutes>0?'über':'unter')+' dem jüngsten Median')
 }
 if(hrv.difference!==null)clauses.push(
  Math.round(hrv.difference)===0?'HRV nahe dem jüngsten Median':
   'HRV '+(hrv.difference>0?'darüber':'darunter'))
 if(rhr.difference!==null)clauses.push(
  Math.round(rhr.difference)===0?'Ruhepuls nahe dem jüngsten Median':
   'Ruhepuls '+(rhr.difference>0?'darüber':'darunter'))
 const headline=clauses.length?clauses.join(' · '):
  'Für einen belastbaren Vergleich fehlen noch Messwerte.'
 return {metrics,headline,latestDay,referenceStart:earliest,referenceEnd:calendarDayOffset(latestDay,-1)}
}
export function formatSleep(seconds:number|null){
 if(seconds===null||!Number.isFinite(seconds))return '–'
 const minutes=Math.round(seconds/60)
 return Math.floor(minutes/60)+':'+String(minutes%60).padStart(2,'0')+' h'
}
export function differenceLabel(row:RecoveryComparison):string{
 if(row.difference===null)return 'Noch kein Vergleich'
 const delta=row.metric==='sleep_seconds'?
  Math.round(row.difference/60):Math.round(row.difference)
 const suffix=row.metric==='sleep_seconds'?' Min.':row.metric==='hrv_ms'?' ms':' bpm'
 return (delta>0?'+':'')+String(delta)+suffix
}

/** Human-readable trend summary. Descriptive only: no readiness classification. */
export function recoveryNarrative(report:ReturnType<typeof interpretRecovery>):string{
 if(!report)return 'Deine letzten Garmin-Messungen werden eingeordnet, sobald sie vorliegen.'
 const [sleep,hrv,pulse]=report.metrics
 const parts:string[]=[]
 if(sleep.difference!==null){
  const minutes=Math.round(Math.abs(sleep.difference)/60)
  parts.push(minutes===0?'Schlafdauer nahe dem jüngsten Median':
    minutes+' Min. '+(sleep.difference>0?'mehr':'weniger')+' Schlaf als zuletzt')
 }
 if(hrv.difference!==null)parts.push(
  Math.round(hrv.difference)===0?'HRV nahe dem jüngsten Median':
  'HRV '+(hrv.difference>0?'über':'unter')+' dem jüngsten Median')
 if(pulse.difference!==null)parts.push(
  Math.round(pulse.difference)===0?'Ruhepuls nahe dem jüngsten Median':
  'Ruhepuls '+(pulse.difference>0?'über':'unter')+' dem jüngsten Median')
 return parts.length?parts.join(' · ')+'.':
  'Für einen Vergleich fehlen noch genügend gültige Messungen.'
}

/** Only documented, individually validated Garmin sleep fields.
 * Never preserve raw responses, infer stages, or turn absent data into zero. */
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{}
export const SLEEP_FIELDS=['deepSeconds','lightSeconds','remSeconds','awakeSeconds','score','sleepStress']
export function sanitizeSleep(value){
 const v=obj(value),out={}
 for(const key of SLEEP_FIELDS){
  const n=number(v[key],0,key==='score'||key==='sleepStress'?100:86400)
  if(n!==null)out[key]=Math.round(n)
 }
 return Object.keys(out).length?out:null
}
export function normalizeGarminSleep(value){
 const v=obj(value)
 // A device explicitly not capable of REM cannot report valid REM composition.
 const score=obj(obj(v.sleepScores).overall).value
 return sanitizeSleep({deepSeconds:v.deepSleepSeconds,lightSeconds:v.lightSleepSeconds,remSeconds:v.deviceRemCapable===false?null:v.remSleepSeconds,awakeSeconds:v.awakeSleepSeconds,score,sleepStress:v.avgSleepStress})
}
export function mergeSleepMetrics(raw,update){
 // Keep unrelated existing private metadata, replace a complete stage snapshot
 // as a unit to avoid mixing two different versions of the same night.
 const result={...obj(raw)},next=sanitizeSleep(update)
 if(next)result.recovery_sleep_v1=next
 return result
}
export function publicRecoveryRow(row){
 // Expose only normalized fields from the private JSON, never raw_metrics.
 const {raw_metrics,...rest}=row
 return {...rest,sleepDetail:sanitizeSleep(obj(raw_metrics).recovery_sleep_v1)}
}
const shift=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null}
export function completedDaySignal(history,today,key){
 if(!['stress_avg','body_battery_max'].includes(key)||!/^\d{4}-\d{2}-\d{2}$/.test(today)||!Number.isFinite(Date.parse(today+'T12:00:00Z')))return null
 const date=shift(today,-1),first=shift(date,-14)
 const rows=[...new Map((history||[]).map(r=>[r.metric_date,r])).values()]
 const value=number(rows.find(r=>r.metric_date===date)?.[key],0,100)
 const prior=rows.filter(r=>r.metric_date>=first&&r.metric_date<date).map(r=>number(r[key],0,100)).filter(v=>v!==null)
 const base=prior.length>=7?median(prior):null
 return {date,value,base,delta:value!==null&&base!==null?value-base:null,sampleCount:prior.length}
}
export function sleepDetailEvidence(history,today){
 const current=sanitizeSleep(history.find(r=>r.metric_date===today)?.sleepDetail)
 if(!current)return {text:'',disrupted:false}
 const first=shift(today,-14),prior=[...new Map(history.filter(r=>r.metric_date>=first&&r.metric_date<today).map(r=>[r.metric_date,r])).values()].map(r=>sanitizeSleep(r.sleepDetail)).filter(Boolean)
 const compare=(key,threshold,direction)=>{
  const a=prior.map(r=>r[key]).filter(v=>typeof v==='number'),v=current[key]
  if(a.length<7||typeof v!=='number')return false
  return direction*(v-median(a))>=threshold
 }
 const lowScore=compare('score',15,-1),awake=compare('awakeSeconds',30*60,1),stress=compare('sleepStress',10,1)
 // Garmin score, awakenings and stage estimates overlap. One corroborating
 // sleep-quality signal at most; no standalone stage threshold.
 const texts=[]
 if(lowScore)texts.push('Garmin-Schlafscore deutlich unter deinem üblichen Wert.')
 if(awake)texts.push('Geschätzte Wachzeit nachts länger als üblich.')
 if(stress)texts.push('Garmin-Schlafstress höher als üblich.')
 return {text:texts.join(' '),disrupted:lowScore||awake||stress}
}
export function sleepComposition(value){
 const v=sanitizeSleep(value)
 if(!v||!['deepSeconds','lightSeconds','remSeconds','awakeSeconds'].every(k=>typeof v[k]==='number'))return null
 const total=v.deepSeconds+v.lightSeconds+v.remSeconds+v.awakeSeconds
 return total>0&&total<=86400?{total,stages:[['deepSeconds',v.deepSeconds],['lightSeconds',v.lightSeconds],['remSeconds',v.remSeconds],['awakeSeconds',v.awakeSeconds]]}:null
}

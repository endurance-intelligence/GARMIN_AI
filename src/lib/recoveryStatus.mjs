/** Descriptive personal comparisons, not population norms or medical grades.
 * Thresholds are UI orientation only; never feed back into training decisions. */
const num=v=>typeof v==='number'&&Number.isFinite(v)
const status=(tone,label)=>({tone,label,emoji:{usual:'🙂',mild:'😐',notice:'😕',unknown:'—',higher:'🙂'}[tone]})
const unknown=()=>status('unknown','Kein Vergleich')
export function recoveryStatus(metric,value,baseline,{fresh=true,persistentLow=false}={}){
 if(!fresh)return status('unknown','Nicht aktuell')
 if(!num(value))return status('unknown','Kein Messwert')
 if(metric==='hrv_ms'&&persistentLow)return status('notice','Längerfristig niedriger')
 if(!num(baseline))return unknown()
 const delta=value-baseline
 const negative=(change,mild,strong,betterLabel='Günstiger als sonst')=>change>=strong?status('notice','Deutlich auffällig'):change>=mild?status('mild','Leicht auffällig'):change<=-mild?status('higher',betterLabel):status('usual','Wie gewohnt')
 if(metric==='sleep_seconds'){
  if(value<6*3600)return status('notice','Kurze Nacht')
  if(delta<=-3600)return status('notice','Deutlich kürzer')
  if(delta<=-1800)return status('mild','Etwas kürzer')
  if(delta>=1800)return status('usual','Länger als sonst')
  return status('usual','Wie gewohnt')
 }
 if(metric==='hrv_ms'){
  if(baseline<=0)return unknown()
  const ratio=delta/baseline
  if(ratio<=-.15)return status('notice','Deutlich niedriger')
  if(ratio<=-.10)return status('mild','Etwas niedriger')
  if(ratio>=.25)return status('mild','Deutlich höher')
  if(ratio>=.10)return status('usual','Etwas höher')
  return status('usual','Wie gewohnt')
 }
 if(metric==='resting_heart_rate')return delta<=-5?status('mild','Deutlich niedriger'):negative(delta,4,5,'Niedriger als sonst')
 if(metric==='stress_avg')return negative(delta,5,10,'Weniger als sonst')
 if(metric==='body_battery_max')return negative(-delta,8,15,'Höher als sonst')
 if(metric==='score')return negative(-delta,8,15,'Höher als sonst')
 return unknown()
}
export function sleepScoreStatus(history,today){
 if(typeof today!=='string'||!Number.isFinite(Date.parse(today+'T12:00:00Z')))return unknown()
 const first=new Date(Date.parse(today+'T12:00:00Z')-14*86400000).toISOString().slice(0,10)
 const rows=[...new Map((Array.isArray(history)?history:[]).filter(r=>typeof r?.metric_date==='string').map(r=>[r.metric_date,r])).values()]
 const score=r=>num(r?.sleepDetail?.score)&&r.sleepDetail.score>=0&&r.sleepDetail.score<=100?r.sleepDetail.score:null
 const prior=rows.filter(r=>r.metric_date>=first&&r.metric_date<today).map(score).filter(num).sort((a,b)=>a-b)
 const base=prior.length<7?null:(prior[Math.floor((prior.length-1)/2)]+prior[Math.floor(prior.length/2)])/2
 return recoveryStatus('score',score(rows.find(r=>r.metric_date===today)),base)
}

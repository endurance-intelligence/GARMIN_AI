/** Evidence-based rolling-week comparison. The daily HRV reading is NOT a weekly trend. */
const valid=x=>typeof x==='number'&&Number.isFinite(x)
const dateShift=(day,days)=>new Date(Date.parse(day+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)
const median=a=>{const v=[...a].sort((x,y)=>x-y);const i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2}
const extract=(rows,metric,from,to,min,max)=>rows.filter(d=>d?.metric_date>=from&&d.metric_date<=to&&valid(d?.[metric])&&d[metric]>=min&&d[metric]<=max).map(d=>d[metric])
export function recoveryWeekTrend(rows,date){
 if(!Array.isArray(rows)||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
 const lastStart=dateShift(date,-6),prevStart=dateShift(date,-13),prevEnd=dateShift(date,-7)
 const defs=[['hrv_ms',10,250],['resting_heart_rate',25,110],['sleep_seconds',10800,57600]]
 const metrics={}
 for(const [metric,min,max] of defs){
  const last=extract(rows,metric,lastStart,date,min,max)
  const prev=extract(rows,metric,prevStart,prevEnd,min,max)
  if(last.length<5||prev.length<5)continue
  metrics[metric]={current:median(last),previous:median(prev),lastCount:last.length,previousCount:prev.length}
 }
 const h=metrics.hrv_ms
 const status=h&&h.previous>0?(h.current/h.previous<.9?'lower':h.current/h.previous>1.1?'higher':'stable'):null
 return {metrics,status,from:lastStart,to:date,previousFrom:prevStart,previousTo:prevEnd}
}

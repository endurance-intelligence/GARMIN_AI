/** Non-overlapping personal reference. A prolonged low HRV must not become
 * normal simply because the rolling 14-day median follows it downward.
 * Advisory evidence, not a diagnosis, population threshold or readiness score. */
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const median=v=>{const a=[...v].sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null}
const defs=[{key:'hrv_ms',min:1,max:500},{key:'resting_heart_rate',min:20,max:220},{key:'sleep_seconds',min:10800,max:57600},{key:'stress_avg',min:0,max:100},{key:'body_battery_max',min:0,max:100}]
export function analyzeLongTermRecovery(history,today){
 const empty={hrv:null,metrics:[],persistentLow:false,severeLow:false,summary:''}
 if(!validDate(today)||!Array.isArray(history))return empty
 const rows=[...new Map(history.filter(r=>validDate(r?.metric_date)&&r.metric_date>=shift(today,-89)&&r.metric_date<=today).map(r=>[r.metric_date,r])).values()]
 const metrics=defs.map(({key,min,max})=>{
  // Today's stress and maximum battery are unfinished; never compare partial day.
  const anchor=['stress_avg','body_battery_max'].includes(key)?shift(today,-1):today
  const samples=(start,end)=>rows.filter(r=>r.metric_date>=shift(anchor,start)&&r.metric_date<=shift(anchor,end)&&typeof r[key]==='number'&&Number.isFinite(r[key])&&r[key]>=min&&r[key]<=max).map(r=>r[key])
  const older=samples(-89,-14),recent14=samples(-13,0),recent7=samples(-6,0),recent3=samples(-2,0)
  const reference=older.length>=10?median(older):null
  const m14=recent14.length>=10?median(recent14):null,m7=recent7.length>=5?median(recent7):null,m3=recent3.length>=2?median(recent3):null
  const ratio=reference>0&&m14!==null?m14/reference:null
  return {key,reference,referenceCount:older.length,referenceStart:shift(anchor,-89),referenceEnd:shift(anchor,-14),median3:m3,median7:m7,median14:m14,count3:recent3.length,count7:recent7.length,count14:recent14.length,ratio14:ratio,low14:reference>0?recent14.filter(v=>v<=reference*.65).length:0,low7:reference>0?recent7.filter(v=>v<=reference*.7).length:0}
 })
 const hrv=metrics.find(r=>r.key==='hrv_ms')
 const persistentLow=hrv.reference>0&&hrv.median7!==null&&hrv.low7>=5&&hrv.median7<=hrv.reference*.7
 const severeLow=!!(persistentLow&&hrv.median14!==null&&hrv.low14>=10&&hrv.ratio14<=.6)
 const summary=severeLow?'Deine HRV liegt seit vielen Tagen deutlich unter dem früheren persönlichen Vergleichswert: '+Math.round(hrv.median14)+' statt '+Math.round(hrv.reference)+' ms im Median ('+Math.round((1-hrv.ratio14)*100)+' % niedriger; '+hrv.low14+' von '+hrv.count14+' Messungen in 14 Tagen deutlich niedriger).':
 persistentLow?'Deine HRV bleibt in den letzten sieben Tagen deutlich unter dem früheren persönlichen Vergleichswert ('+Math.round(hrv.median7)+' statt '+Math.round(hrv.reference)+' ms).':''
 return {hrv,metrics,persistentLow:!!persistentLow,severeLow,summary}
}

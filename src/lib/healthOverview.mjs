// Calendar-day data only, no interpolation of missing values or fabricated scores.
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
export const shiftDay=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const fields={hrv_ms:[1,300],resting_heart_rate:[20,200],sleep_seconds:[1,86400],stress_avg:[0,100],body_battery_max:[0,100]}
const numeric=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi
export function healthOverview(rows,today){
 if(!validDate(today)||!Array.isArray(rows))return []
 return Object.entries(fields).map(([key,[lo,hi]])=>{
  const unique=new Map()
  for(const r of rows)if(validDate(r?.metric_date)&&r.metric_date<=today&&r.metric_date>=shiftDay(today,-29)&&numeric(r[key],lo,hi)&&!unique.has(r.metric_date))unique.set(r.metric_date,r[key])
  const points=[...unique].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,value])=>({date,value}))
  // Today's incomplete stress and battery summaries are not comparable to complete days.
  const end=['stress_avg','body_battery_max'].includes(key)?shiftDay(today,-1):today
  const recent=points.filter(p=>p.date<=end&&p.date>=shiftDay(end,-6))
  const values=recent.map(p=>p.value).sort((a,b)=>a-b)
  const median=values.length>=4?(values[(values.length-1)>>1]+values[values.length>>1])/2:null
  return {key,latest:points.filter(p=>p.date<=end).at(-1)??null,median,count:values.length,points:points.filter(p=>p.date<=end)}
 })
}
export function weightHistory(rows,today){
 if(!validDate(today)||!Array.isArray(rows))return []
 const unique=new Map()
 for(const r of rows){const kg=r?.weight_kg;if(validDate(r?.weigh_date)&&r.weigh_date<=today&&r.weigh_date>=shiftDay(today,-27)&&numeric(kg,30,300)&&!unique.has(r.weigh_date))unique.set(r.weigh_date,kg)}
 return [...unique].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,value])=>({date,value}))
}

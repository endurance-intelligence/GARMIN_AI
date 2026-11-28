// Only explicitly non-predicted, non-pregnancy cycle-day observations.
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
export const cycleToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export function normalizeCycleObservation(raw,date){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!validDate(date)||raw.predictedCycle!==false||raw.pregnancyCycle!==false||!validDate(raw.startDate))return null
 if(!Number.isInteger(raw.dayInCycle)||raw.dayInCycle<1||raw.dayInCycle>180||shift(raw.startDate,raw.dayInCycle-1)!==date)return null
 return {date,dayInCycle:raw.dayInCycle}
}
export function trimCycleHistory(rows,today){
 if(!validDate(today)||!Array.isArray(rows))return []
 const min=shift(today,-179),unique=new Map()
 for(const r of rows)if(validDate(r?.date)&&r.date>=min&&r.date<=today&&Number.isInteger(r.dayInCycle)&&r.dayInCycle>=1&&r.dayInCycle<=180)unique.set(r.date,{date:r.date,dayInCycle:r.dayInCycle})
 return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date))
}
export function publicCycleState(row,today){
 if(row?.enabled!==true)return {enabled:false,status:'idle',lastAttempt:null,observations:[]}
 return {enabled:true,status:['idle','pending','stored','unavailable'].includes(row.status)?row.status:'idle',lastAttempt:validDate(row.last_attempt_on)?row.last_attempt_on:null,observations:trimCycleHistory(row.observations,today)}
}

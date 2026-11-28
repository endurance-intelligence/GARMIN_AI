/** Two non-overlapping 14-day windows; no diagnoses or plan changes.
 * Weight alone never produces an alert or a recommendation to lose weight. */
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const median=a=>{const s=[...a].sort((x,y)=>x-y);return (s[(s.length-1)>>1]+s[s.length>>1])/2}
function compare(rows,dateKey,valueKey,today,minSamples,min,max){
 const unique=new Map()
 for(const r of Array.isArray(rows)?rows:[]){const d=r?.[dateKey],v=r?.[valueKey];if(validDate(d)&&d>=shift(today,-27)&&d<=today&&typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&!unique.has(d))unique.set(d,v)}
 const pivot=shift(today,-13),recent=[...unique].filter(([d])=>d>=pivot),prior=[...unique].filter(([d])=>d<pivot)
 if(recent.length<minSamples||prior.length<minSamples||!recent.some(([d])=>d>=shift(today,-3)))return null
 const current=median(recent.map(([,v])=>v)),previous=median(prior.map(([,v])=>v))
 return {current,previous,delta:current-previous,currentCount:recent.length,previousCount:prior.length}
}
export function healthCoachContext({today,weights,health,adultConfirmed}={}){
 if(adultConfirmed!==true||!validDate(today))return null
 const weight=compare(weights,'weigh_date','weight_kg',today,4,30,300)
 if(!weight)return null
 const hrv=compare(health,'metric_date','hrv_ms',today,7,10,250)
 const pulse=compare(health,'metric_date','resting_heart_rate',today,7,25,110)
 const sleep=compare(health,'metric_date','sleep_seconds',today,7,3*3600,16*3600)
 const signals=[]
 if(hrv&&hrv.delta/hrv.previous<=-.15)signals.push('HRV niedriger')
 if(pulse&&pulse.delta>=5)signals.push('Ruhepuls höher')
 if(sleep&&sleep.delta<=-3600)signals.push('Schlaf kürzer')
 // Conservative descriptive cut-off, not a clinical threshold.
 const changed=Math.abs(weight.delta)>=Math.max(.5,weight.previous*.01)
 if(!changed||signals.length<2)return null
 const direction=weight.delta<0?'gesunken':'gestiegen'
 return {title:'Deine Entwicklung im Zusammenhang',text:'Dein Gewichtsmedian ist '+direction+'. Gleichzeitig: '+signals.join(', ')+'. Achte auf ausreichend Essen, Trinken und Erholung. Das sind beobachtete Veränderungen, keine nachgewiesene Ursache. Bei anhaltenden unerklärlichen Veränderungen oder Beschwerden lass sie ärztlich abklären.',weightChange:Math.round(weight.delta*10)/10,weightCounts:[weight.currentCount,weight.previousCount],signals}
}

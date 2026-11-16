/** Evidence-first visual helpers: display only real Garmin/Intervals data. */
export const zoneColors=['#59b8ff','#60d9d0','#9fe0a0','#d3dd79','#ffd079','#f4a579','#ed8fa9','#c197ff','#a3a7ef','#7a99d8']
export const validHr=x=>typeof x==='number'&&Number.isFinite(x)&&x>=35&&x<=220
/** 1-based configured zone for a single or average HR; never a time-in-zone claim. */
export function zoneIndexForHr(hr,limits){
 if(!validHr(hr)||!Array.isArray(limits))return null
 const bounds=limits.filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=40&&x<=220)
 if(bounds.length<2||bounds.some((x,i)=>i>0&&x<=bounds[i-1]))return null
 const pos=bounds.findIndex(limit=>hr<=limit)
 return pos>=0?pos+1:bounds.length+1
}
export function heartZoneDistribution(samples,limits){
 if(!Array.isArray(samples)||!Array.isArray(limits))return null
 const boundaries=[...new Set(limits.filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=40&&x<=220))].sort((a,b)=>a-b)
 if(boundaries.length<2||boundaries.length>11)return null
 const valid=samples.map(x=>x?.hr).filter(validHr)
 if(valid.length<80||valid.length/samples.length<0.75)return null
 const counts=new Array(boundaries.length+1).fill(0)
 for(const hr of valid){
  const pos=boundaries.findIndex(bound=>hr<=bound)
  counts[pos>=0?pos:boundaries.length]++
 }
 const bands=counts.map((count,i)=>({
  index:i+1,count,percentage:Math.round(count/valid.length*1000)/10,
  low:i===0?null:boundaries[i-1]+1,
  high:i===boundaries.length?null:boundaries[i],
  color:zoneColors[i%zoneColors.length]
 }))
 return {valid:valid.length,total:samples.length,bands}
}
export function splitBarHeight(splits,idx){
 if(!Array.isArray(splits)||!splits[idx])return 60
 const speeds=splits.map(s=>1000/Number(s?.paceSeconds)).filter(n=>Number.isFinite(n)&&n>0)
 const speed=1000/Number(splits[idx]?.paceSeconds)
 if(speeds.length<2||!Number.isFinite(speed))return 60
 const min=Math.min(...speeds),max=Math.max(...speeds)
 if(max-min<.015)return 62
 return Math.round(36+55*(speed-min)/(max-min))
}
export function paceLabel(seconds){
 if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<150||seconds>2400)return '–'
 const t=Math.round(seconds)
 return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')
}
export function compactHr(value){
 return validHr(value)?Math.round(value)+' bpm':'HF fehlt'
}

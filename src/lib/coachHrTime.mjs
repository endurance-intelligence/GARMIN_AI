/**
 * Classifies time-in-Garmin-device-zone from ACTUAL timed FIT seconds.
 * Garmin zone 2 is not a validated LT1/VT1 threshold; do not call it
 * metabolic/polarized time-in-zone or an empirical 80/20 prescription.
 */
const number=n=>typeof n==='number'&&Number.isFinite(n)
export function classifyGarminHrSeconds(weekRows=[],profile=null){
 const zones=profile?.zones
 const low=profile?.zone1Min
 const present=Array.isArray(zones)&&zones.length===5&&
  zones.every((n,i)=>Number.isInteger(n)&&n>=70&&n<=230&&(i===0||n>zones[i-1]))&&
  Number.isInteger(low)&&low>=35&&low<=zones[0]
 const result={status:'insufficient',source:'Garmin FIT seconds + current Garmin running HR zones',
  sampleBasis:'time-weighted',validWeeks:0,missingWeeks:0,
  activities:0,measuredActivities:0,skippedActivities:0,
  measuredSeconds:0,zoneSeconds:null,zones:[],
  belowOrInZ2Share:null,coveredPercent:null,profileStatus:present?'available':'unavailable'}
 if(!Array.isArray(weekRows))return result
 const seen=new Set()
 const hist={}
 let expected=0
 for(const row of weekRows){
  const week=typeof row?.start==='string'?row.start:''
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||seen.has(week))continue
  seen.add(week)
  if(!row||!Number.isInteger(row.totalActivities)||row.totalActivities<0||
   !Number.isInteger(row.measuredActivities)||row.measuredActivities<0||
   !Number.isInteger(row.validSeconds)||row.validSeconds<0||
   !row.histogram||typeof row.histogram!=='object')continue
  result.validWeeks++
  result.activities+=row.totalActivities
  result.measuredActivities+=row.measuredActivities
  result.skippedActivities+=row.skippedActivities||0
  expected+=number(row.measuredExpectedSeconds)?row.measuredExpectedSeconds:0
  for(const [key,s] of Object.entries(row.histogram)){
   const bpm=Number(key)
   if(!Number.isInteger(bpm)||bpm<35||bpm>220||!number(s)||s<0)continue
   hist[bpm]=(hist[bpm]||0)+s
  }
 }
 result.measuredSeconds=Object.values(hist).reduce((a,b)=>a+b,0)
 result.coveredPercent=expected>0?Math.round(result.measuredSeconds/expected*1000)/10:null
 if(!present)return {...result,status:'no-zones'}
 const labels=['Unter Z1','Z1','Z2','Z3','Z4','Z5','Über Z5']
 const bins=labels.map((label,i)=>({label,index:i,seconds:0,share:0,
  lower:i===0?null:i===1?low:i===6?zones[4]+1:zones[i-2]+1,
  upper:i===0?low-1:i===6?null:zones[i-1]}))
 for(const [raw,secs] of Object.entries(hist)){
  const bpm=Number(raw)
  const idx=bpm<low?0:bpm>zones[4]?6:zones.findIndex(z=>bpm<=z)+1
  if(idx>=0)bins[idx].seconds+=secs
 }
 for(const bin of bins){
  bin.share=result.measuredSeconds>0?
   Math.round(1000*bin.seconds/result.measuredSeconds)/10:0
 }
 return {...result,status:result.measuredActivities>0?'measured':'insufficient',
  zoneSeconds:bins.map(b=>b.seconds),zones:bins,
  belowOrInZ2Share:result.measuredSeconds>0?
   Math.round(1000*(bins[0].seconds+bins[1].seconds+bins[2].seconds)/result.measuredSeconds)/10:null}
}

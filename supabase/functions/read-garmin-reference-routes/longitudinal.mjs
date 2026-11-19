/**
 * Read-only longitudinal comparison of runs on a GPS-confirmed route.
 * Pace and HR are observational; never a diagnosis, VO2max estimate,
 * inferred LT1/LT2 threshold, or a reason for automatic coach updates.
 * Raw locations, activity IDs and FIT records MUST NOT be returned.
 */
const numeric=x=>typeof x==='number'&&Number.isFinite(x)?x:null
const median=xs=>{
  if(!xs.length)return null
  const a=[...xs].sort((x,y)=>x-y),k=Math.floor(a.length/2)
  return a.length%2?a[k]:(a[k-1]+a[k])/2
}
const round=(x,d=1)=>Number(x.toFixed(d))
const ordinal=date=>{
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
  const value=Date.parse(date+'T12:00:00Z')
  return Number.isFinite(value)?value/86400000:null
}
const gap=(a,b)=>Math.abs(a-b)
const summary=(reason,matchedRuns=0,spanDays=0)=>({
  status:'insufficient',reason,matchedRuns,spanDays,requiredRuns:6
})

/**
 * Conservative comparison:
 *  - >=6 independent days of GPS-verified easy runs, >=90 days, >=3 months
 *  - fixed average HR band ±4 bpm and RPE band ±1 around medians
 *  - first/last two runs separated by >=45 days; median HR drift <=2 bpm
 *  - robust Theil–Sen pace slope from all eligible pairs spaced >=14 days
 *  - no automatic improvement/regression claim if the two metrics disagree
 */
export function longitudinalRouteTrend(runs,{verified=false}={}){
  if(!verified)return {status:'not-gps',reason:'route-unverified'}
  if(!Array.isArray(runs))return summary('few-comparable-runs')
  const easy=runs.filter(r=>{
    const pace=numeric(r?.pace),hr=numeric(r?.hr),rpe=numeric(r?.rpe)
    return ordinal(r?.date)!==null&&pace!==null&&pace>=180&&pace<=840&&
      hr!==null&&hr>=85&&hr<=175&&rpe!==null&&rpe>=1&&rpe<=5&&
      numeric(r?.hrCoverage)!==null&&r.hrCoverage>=.7
  })
  if(easy.length<6)return summary('few-easy-runs',easy.length)
  const targetHr=median(easy.map(r=>r.hr))
  const targetRpe=median(easy.map(r=>r.rpe))
  const matched=easy.filter(r=>gap(r.hr,targetHr)<=4&&gap(r.rpe,targetRpe)<=1)
    .sort((a,b)=>ordinal(a.date)-ordinal(b.date))
  // Repeated recordings on one date are not independent observations.
  const dates=new Set()
  const independent=matched.filter(r=>{
    if(dates.has(r.date))return false
    dates.add(r.date)
    return true
  })
  if(independent.length<6)return summary('few-comparable-runs',independent.length)
  const first=ordinal(independent[0].date),last=ordinal(independent.at(-1).date)
  const spanDays=Math.round(last-first)
  if(spanDays<90)return summary('short-period',independent.length,spanDays)
  const months=new Set(independent.map(r=>r.date.slice(0,7)))
  if(months.size<3)return summary('too-few-months',independent.length,spanDays)
  const older=independent.slice(0,2),recent=independent.slice(-2)
  if(ordinal(recent[0].date)-ordinal(older[1].date)<45)
    return summary('time-windows-overlap',independent.length,spanDays)
  const oldHr=median(older.map(r=>r.hr)),newHr=median(recent.map(r=>r.hr))
  const oldRpe=median(older.map(r=>r.rpe)),newRpe=median(recent.map(r=>r.rpe))
  if(gap(oldHr,newHr)>2||gap(oldRpe,newRpe)>1)
    return summary('load-drift',independent.length,spanDays)
  const olderPace=median(older.map(r=>r.pace))
  const newerPace=median(recent.map(r=>r.pace))
  const slopes=[]
  for(let i=0;i<independent.length;i++)
    for(let j=i+1;j<independent.length;j++){
      const d=ordinal(independent[j].date)-ordinal(independent[i].date)
      if(d>=14)slopes.push((independent[j].pace-independent[i].pace)*90/d)
    }
  if(slopes.length<6)return summary('few-separated-pairs',independent.length,spanDays)
  const delta=newerPace-olderPace
  const slope90=median(slopes)
  const direction=delta<=-8&&slope90<=-5?'faster':
    delta>=8&&slope90>=5?'slower':'inconclusive'
  // Chart data is capped and stripped of identifying activity information.
  // First/last are retained even when more than 24 runs qualify.
  const chart=independent.length<=24?independent:
    Array.from({length:24},(_,i)=>independent[Math.round(i*(independent.length-1)/23)])
  return {
    status:'ready',direction,matchedRuns:independent.length,spanDays,
    firstDate:independent[0].date,lastDate:independent.at(-1).date,
    referenceHr:round(targetHr),referenceRpe:round(targetRpe),
    olderPace:round(olderPace),newerPace:round(newerPace),
    deltaSecKm:round(delta),medianSlopeSecPer90d:round(slope90),
    olderHr:round(oldHr),newerHr:round(newHr),
    olderRpe:round(oldRpe),newerRpe:round(newRpe),
    series:chart.map(r=>({date:r.date,paceSecKm:round(r.pace),
      averageHr:round(r.hr),rpe:round(r.rpe)}))
  }
}

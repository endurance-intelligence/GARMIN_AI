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
const summary=(reason,matchedRuns=0,spanDays=0,excludedOutliers=0)=>({
  status:'insufficient',reason,matchedRuns,spanDays,excludedOutliers,requiredRuns:6
})
// Robust fit removes isolated GPS-route pace anomalies (unexpected pauses,
// unreliable recordings, atypical day). It does not remove true gradual
// improvement, because residuals are measured against a time-based trend.
const robustLine=runs=>{
  const pairs=[]
  for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++){
    const interval=ordinal(runs[j].date)-ordinal(runs[i].date)
    if(interval>=14)pairs.push((runs[j].pace-runs[i].pace)/interval)
  }
  if(pairs.length<3)return null
  const slope=median(pairs)
  const reference=ordinal(runs[0].date)
  const intercept=median(runs.map(r=>r.pace-slope*(ordinal(r.date)-reference)))
  return {slope,reference,intercept}
}
export function screenPaceOutliers(runs){
  if(!Array.isArray(runs)||runs.length<6)
    return {accepted:Array.isArray(runs)?runs:[],excluded:0}
  const fit=robustLine(runs)
  if(!fit)return {accepted:runs,excluded:0}
  const residuals=runs.map(r=>r.pace-fit.intercept-
    fit.slope*(ordinal(r.date)-fit.reference))
  const center=median(residuals)
  const mad=median(residuals.map(x=>Math.abs(x-center)))
  // A minimum 22 s/km respects normal day-to-day variation and terrain.
  // MAD is scaled consistently with Gaussian residuals, but this is NOT a
  // clinical confidence interval or proof of a specific training effect.
  const tolerance=Math.max(22,3.5*1.4826*mad)
  const accepted=runs.filter((r,i)=>Math.abs(residuals[i]-center)<=tolerance)
  return {accepted,excluded:runs.length-accepted.length}
}

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
  const {accepted:stable,excluded:excludedOutliers}=screenPaceOutliers(independent)
  if(stable.length<6)
    return summary('pace-outliers',stable.length,0,excludedOutliers)
  // Too many atypical days can undermine any inferred trend even if enough
  // measurements remain. Surface uncertainty instead of silently discarding.
  if(excludedOutliers>=2&&excludedOutliers/independent.length>.20)
    return summary('unstable-pace',stable.length,0,excludedOutliers)
  const first=ordinal(stable[0].date),last=ordinal(stable.at(-1).date)
  const spanDays=Math.round(last-first)
  if(spanDays<90)return summary('short-period',stable.length,spanDays,excludedOutliers)
  const months=new Set(stable.map(r=>r.date.slice(0,7)))
  if(months.size<3)return summary('too-few-months',stable.length,spanDays,excludedOutliers)
  const older=stable.slice(0,2),recent=stable.slice(-2)
  if(ordinal(recent[0].date)-ordinal(older[1].date)<45)
    return summary('time-windows-overlap',stable.length,spanDays,excludedOutliers)
  const oldHr=median(older.map(r=>r.hr)),newHr=median(recent.map(r=>r.hr))
  const oldRpe=median(older.map(r=>r.rpe)),newRpe=median(recent.map(r=>r.rpe))
  if(gap(oldHr,newHr)>2||gap(oldRpe,newRpe)>1)
    return summary('load-drift',stable.length,spanDays,excludedOutliers)
  const olderPace=median(older.map(r=>r.pace))
  const newerPace=median(recent.map(r=>r.pace))
  const slopes=[]
  for(let i=0;i<stable.length;i++)
    for(let j=i+1;j<stable.length;j++){
      const d=ordinal(stable[j].date)-ordinal(stable[i].date)
      if(d>=14)slopes.push((stable[j].pace-stable[i].pace)*90/d)
    }
  if(slopes.length<6)return summary('few-separated-pairs',stable.length,spanDays,excludedOutliers)
  const delta=newerPace-olderPace
  const slope90=median(slopes)
  const direction=delta<=-8&&slope90<=-5?'faster':
    delta>=8&&slope90>=5?'slower':'inconclusive'
  // Chart data is capped and stripped of identifying activity information.
  // First/last are retained even when more than 24 runs qualify.
  const chart=stable.length<=24?stable:
    Array.from({length:24},(_,i)=>stable[Math.round(i*(stable.length-1)/23)])
  return {
    status:'ready',direction,matchedRuns:stable.length,spanDays,excludedOutliers,
    firstDate:stable[0].date,lastDate:stable.at(-1).date,
    referenceHr:round(targetHr),referenceRpe:round(targetRpe),
    olderPace:round(olderPace),newerPace:round(newerPace),
    deltaSecKm:round(delta),medianSlopeSecPer90d:round(slope90),
    olderHr:round(oldHr),newerHr:round(newHr),
    olderRpe:round(oldRpe),newerRpe:round(newRpe),
    series:chart.map(r=>({date:r.date,paceSecKm:round(r.pace),
      averageHr:round(r.hr),rpe:round(r.rpe)}))
  }
}

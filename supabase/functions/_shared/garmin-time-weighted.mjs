/**
 * Actual FIT elapsed-time weighting, not counting sample points.
 * Excludes long sampling gaps and paused periods rather than interpolating
 * missing heart rate. No GPS, no physiological LT1/LT2 inference.
 */
const hr=x=>typeof x==='number'&&Number.isFinite(x)&&x>=35&&x<=220?Math.round(x):null
const sec=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1_000_000?x:null
export const HR_TIME_MIN_COVERAGE=.75
export const HR_TIME_MAX_CONTIGUOUS_DELTA=3

export function sumRecordedHrSeconds(chunks,expectedSeconds){
 const histogram={}
 let validSeconds=0,observedSeconds=0,missingGapSeconds=0,pointCount=0,last=null
 for(const chunk of Array.isArray(chunks)?chunks:[]){
  for(const p of Array.isArray(chunk)?chunk:[]){
   const current=sec(p?.elapsed)
   if(current===null)continue
   const heart=hr(p?.hr)
   pointCount++
   if(last!==null){
    const delta=current-last.elapsed
    if(delta>0&&delta<=HR_TIME_MAX_CONTIGUOUS_DELTA){
     observedSeconds+=delta
     if(last.hr!==null){
      histogram[last.hr]=(histogram[last.hr]||0)+delta
      validSeconds+=delta
     }
    }else if(delta>HR_TIME_MAX_CONTIGUOUS_DELTA)missingGapSeconds+=delta
   }
   // Preserve order. Duplicated samples at the same elapsed second overwrite only
   // their own future second; reversed clock does not corrupt the next interval.
   if(last===null||current>=last.elapsed)last={elapsed:current,hr:heart}
  }
 }
 const expected=sec(expectedSeconds)
 const covered=expected!==null&&expected>=180?
  Math.round(1000*validSeconds/expected)/10:null
 const plausible=expected!==null&&expected>=180&&
  validSeconds<=expected*1.08
 const eligible=plausible&&pointCount>=80&&validSeconds>=180&&
  validSeconds/expected>=HR_TIME_MIN_COVERAGE
 return {eligible,pointCount,validSeconds,observedSeconds,missingGapSeconds,
  expectedSeconds:expected,coveredPercent:covered,histogram:eligible?histogram:{},
  status:eligible?'measured':'insufficient'}
}
export function mergeTimeHistograms(rows){
 const histogram={}
 let validSeconds=0,measuredActivities=0,skippedActivities=0,totalActivities=0,
  measuredExpectedSeconds=0
 for(const row of Array.isArray(rows)?rows:[]){
  totalActivities++
  if(!row?.eligible){
   skippedActivities++;continue
  }
  measuredActivities++
  validSeconds+=row.validSeconds
  measuredExpectedSeconds+=row.expectedSeconds
  for(const [bpm,seconds] of Object.entries(row.histogram||{})){
   histogram[bpm]=(histogram[bpm]||0)+seconds
  }
 }
 return {histogram,validSeconds,measuredActivities,skippedActivities,
  totalActivities,measuredExpectedSeconds}
}

/** Keep the learning card hidden while gathering evidence. A real applied
 * caution must remain explainable even if the broader display gate is unmet. */
import {normalizeGarminRpe,normalizeGarminFeeling} from './garminPerception.mjs'
const num=v=>typeof v==='number'&&Number.isFinite(v)
const inRange=(v,min,max)=>num(v)&&v>=min&&v<=max
export function showArchivedLearning(review,health,boards,today){
 if(!review||!Array.isArray(review.weeks))return false
 if(review.caution===true)return true
 if(typeof today!=='string'||!Number.isFinite(Date.parse(today+'T12:00:00Z')))return false
 const comparable=review.weeks.filter(w=>['comparable','target-only'].includes(w.status))
 if(comparable.length<2)return false
 const floor=new Date(Date.parse(today+'T12:00:00Z')-27*86400000).toISOString().slice(0,10)
 const healthDays=new Set((Array.isArray(health)?health:[]).filter(r=>r?.metric_date>=floor&&r.metric_date<=today&&[inRange(r.hrv_ms,10,250),inRange(r.sleep_seconds,10800,57600),inRange(r.resting_heart_rate,25,110)].filter(Boolean).length>=2).map(r=>r.metric_date))
 if(healthDays.size<14)return false
 const runs=new Set(),rated=new Set()
 for(const b of Array.isArray(boards)?boards:[]){
  const w=comparable.find(w=>w.start===b?.start)
  if(!w||!Array.isArray(b.activities))continue
  for(const a of b.activities){
   const d=String(a?.start_time_local||'').slice(0,10)
   if(a?.activity_id==null||!String(a.activity_id)||d<w.start||d>w.end||d>=today||!/run|jog|trail/i.test(a.sport_type||'')||!num(a.duration_s)||a.duration_s<=0)continue
   const id=String(a.activity_id);runs.add(id)
   if(normalizeGarminRpe(a.rpe_raw)!==null||normalizeGarminFeeling(a.feeling_raw)!==null)rated.add(id)
  }
 }
 return runs.size>=6&&rated.size>=4
}

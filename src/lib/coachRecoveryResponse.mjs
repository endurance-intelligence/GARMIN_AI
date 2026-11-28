import {normalizeGarminRpe} from './garminPerception.mjs'
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const monday=d=>shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))
const valid=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max
const median=a=>{const s=[...a].sort((a,b)=>a-b);return (s[(s.length-1)>>1]+s[s.length>>1])/2}
const run=new Set(['running','track_running','treadmill_running','trail_running','ultra_run'])
/** Descriptive within-person association, not a cause, forecast or training prescription.
 * Use recorded single-running-session days only; no inference from unrecorded days. */
export function coachRecoveryResponse({today,boards,health}={}){
 if(!validDay(today)||!Array.isArray(boards)||!Array.isArray(health?.metrics)||health.training?.historyStatus!=='complete'||health.training?.truncated!==false)return null
 const dates=new Map()
 for(const r of health.metrics){if(!validDay(r?.metric_date)||r.metric_date>today)continue
  // Conflicting duplicate dates cannot serve as paired measurements.
  dates.set(r.metric_date,dates.has(r.metric_date)?null:r)
 }
 const low=[],high=[]
 for(let offset=1;offset<=28;offset++){
  const d=shift(today,-offset),next=shift(d,1),week=monday(d)
  const matching=boards.filter(b=>b?.start===week&&Array.isArray(b.activities)&&Array.isArray(b.manual))
  if(matching.length!==1)continue
  const b=matching[0]
  if(b.manual.some(m=>{const date=m?.session_date??m?.training_date??m?.date??m?.start_time_local;return typeof date!=='string'||!validDay(date.slice(0,10))||date.slice(0,10)===d}))continue
  const acts=b.activities.filter(a=>typeof a?.start_time_local==='string'&&a.start_time_local.slice(0,10)===d)
  if(acts.length!==1)continue
  const a=acts[0],rpe=normalizeGarminRpe(a.rpe_raw)
  if(!run.has(a.sport_type)||!['string','number'].includes(typeof a.activity_id)||!String(a.activity_id).trim()||!valid(a.duration_s,600,21600)||rpe===null||(rpe>4&&rpe<8))continue
  const before=dates.get(d),after=dates.get(next)
  if(!before||!after||!valid(before.hrv_ms,10,250)||!valid(after.hrv_ms,10,250)||!valid(before.resting_heart_rate,25,110)||!valid(after.resting_heart_rate,25,110))continue
  ;(rpe<=4?low:high).push({week,hrv:after.hrv_ms-before.hrv_ms,pulse:after.resting_heart_rate-before.resting_heart_rate})
 }
 const enough=a=>a.length>=3&&new Set(a.map(r=>r.week)).size>=2
 if(!enough(low)||!enough(high))return null
 const summarize=a=>({count:a.length,weeks:new Set(a.map(r=>r.week)).size,hrvDelta:Math.round(median(a.map(r=>r.hrv))*10)/10,pulseDelta:Math.round(median(a.map(r=>r.pulse))*10)/10})
 return {low:summarize(low),high:summarize(high)}
}

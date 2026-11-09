/** Pure Garmin scheduled workout date reconciliation. No network or writes. */
const DATE=/^\d{4}-\d{2}-\d{2}$/
const asPositive=x=>{
  const n=typeof x==='number'?x:(typeof x==='string'&&/^[1-9][0-9]{0,15}$/.test(x)?Number(x):NaN)
  return Number.isSafeInteger(n)&&n>0?n:null
}
export const validDate=x=>typeof x==='string'&&DATE.test(x)&&
  !Number.isNaN(Date.parse(x+'T12:00:00Z'))&&
  new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x
export const validId=asPositive

export function validateCalendarDay(date,raw) {
  if(!validDate(date)||!Array.isArray(raw)||raw.length>100)return null
  const rows=[]
  for(const w of raw){
    if(!w||typeof w!=='object'||Array.isArray(w)||
       typeof w.scheduleDate!=='string'||!validDate(w.scheduleDate))
      return null
    if(w.scheduleDate!==date)continue
    const workoutId=w.workoutId==null?null:asPositive(w.workoutId)
    if(w.workoutId!=null&&!workoutId)return null
    const remoteId=w.scheduledWorkoutId==null?null:asPositive(w.scheduledWorkoutId)
    if(w.scheduledWorkoutId!=null&&!remoteId)return null
    rows.push({workoutId,remoteId})
  }
  return rows
}
export function assessCalendarDay(entry,raw) {
  if(!validDate(entry?.date)||!asPositive(entry?.workoutId))
    return {status:'needs_review',code:'unexpected_remote_shape'}
  const day=validateCalendarDay(entry.date,raw)
  if(!day)return {status:'needs_review',code:'unexpected_remote_shape'}
  const matches=day.filter(x=>x.workoutId===asPositive(entry.workoutId))
  if(matches.length>1)return {status:'needs_review',code:'multiple_matches'}
  if(matches.length===1) {
    if(!matches[0].remoteId)return {status:'needs_review',code:'unexpected_remote_shape'}
    return {status:'already_present',code:'already_present',remoteId:String(matches[0].remoteId)}
  }
  return {status:'safe_to_write',code:'no_matching_workout'}
}
export function verifyScheduledWorkout(entry,raw){
 const found=assessCalendarDay(entry,raw)
 if(found.status==='already_present')
   return {status:'confirmed',code:'verified_read_back',remoteId:found.remoteId}
 return {status:'needs_review',code:
   found.status==='safe_to_write'?'write_not_visible':found.code,remoteId:null}
}
export function validatePending(entry){
 if(!entry?.available||!validDate(entry.date)||
    !asPositive(entry.workoutId)||!Number.isInteger(entry.revision)||
    entry.revision<1||
    typeof entry.id!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id))
    return null
 return {id:entry.id,date:entry.date,workoutId:asPositive(entry.workoutId),revision:entry.revision}
}

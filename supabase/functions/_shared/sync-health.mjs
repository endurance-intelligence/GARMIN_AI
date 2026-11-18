/**
 * v0.7.5: interpret REAL observed sync jobs; never promote data presence
 * or cron dispatch alone to a successful sync.
 * status: ok / stale / failed / unknown / manual
 */
export function classifySync({lastAttemptAt=null,lastSuccessAt=null,lastResult=null,thresholdHours=24,now=Date.now(),manual=false}={}) {
  const valid=(x)=>typeof x==='string' && Number.isFinite(Date.parse(x)) &&
    Date.parse(x) <= now + 5*60_000
  if(manual) return {state:'manual',ageMinutes:null,reason:'manual-refresh'}
  if(!valid(lastAttemptAt) && !valid(lastSuccessAt))
    return {state:'unknown',ageMinutes:null,reason:'no-confirmed-run'}
  const last=valid(lastSuccessAt)?Date.parse(lastSuccessAt):null
  const attempted=valid(lastAttemptAt)?Date.parse(lastAttemptAt):null
  if(lastResult==='error' || lastResult==='failed')
    return {state:'failed',ageMinutes:attempted==null?null:Math.max(0,Math.floor((now-attempted)/60000)),reason:'last-run-failed'}
  if(last===null) return {state:'unknown',ageMinutes:null,reason:'no-confirmed-success'}
  const ageMinutes=Math.max(0,Math.floor((now-last)/60000))
  return {state:ageMinutes>thresholdHours*60?'stale':'ok',ageMinutes,
    reason:ageMinutes>thresholdHours*60?'past-freshness-window':'confirmed'}
}
export function classifyFit({queued=0,retry=0,processing=0,paused=0,unavailable=0}={}) {
  const values=[queued,retry,processing,paused,unavailable]
  if(values.some(n=>!Number.isInteger(n)||n<0))return {state:'unknown',pending:null}
  const pending=queued+retry+processing
  return {state:paused>0?'attention':retry>0?'attention':pending>0?'processing':'idle',pending}
}

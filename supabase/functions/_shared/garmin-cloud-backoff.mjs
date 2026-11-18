/** Pure, deterministic Garmin 429 backoff policy.
 * No second request while the current window is active.
 * First 429: 24h; another 429 after cooldown: 48h; then 72h max.
 * The record is intentionally shared by manual and scheduled OIDC audits.
 */
const BACKOFF_HOURS=[24,48,72]
const DAY_HOURS=3600000
const iso=x=>{
 const n=Date.parse(x||'')
 return Number.isFinite(n)?n:null
}
export function activeGarminCooldown(state,now=new Date().toISOString()){
 const until=iso(state?.retry_after),t=iso(now)
 return until!==null&&t!==null&&until>t
}
export function retryAfterLimit(state,now=new Date().toISOString()){
 const t=iso(now)
 if(t===null)throw Error('Invalid UTC clock')
 // Never extend the window on a duplicate 429 notification.
 if(activeGarminCooldown(state,now))return {
  retry_after:new Date(iso(state.retry_after)).toISOString(),
  consecutive_429:Math.max(1,Math.min(3,Number(state.consecutive_429)||1)),
  last_limited_at:state.last_limited_at||now,updated_at:now
 }
 const count=Math.min(3,Math.max(0,Number(state?.consecutive_429)||0)+1)
 return {retry_after:new Date(t+BACKOFF_HOURS[count-1]*DAY_HOURS).toISOString(),
   consecutive_429:count,last_limited_at:now,updated_at:now}
}
export function clearedGarminCooldown(now=new Date().toISOString()){
 if(iso(now)===null)throw Error('Invalid UTC clock')
 return {retry_after:null,consecutive_429:0,last_success_at:now,updated_at:now}
}

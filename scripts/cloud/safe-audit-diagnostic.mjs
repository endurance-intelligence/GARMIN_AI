/** 
 * Diagnostic only. Accepts a strict static phase/status allowlist.
 * Never format SDK exception messages, headers, IDs, profile data or tokens.
 */
const phases=new Set([
 'github-oidc','supabase-vault-read','load-garmin-session','load-baseline',
 'garmin-oauth-refresh','garmin-profile-request','garmin-profile-shape','garmin-gear','garmin-calendar','garmin-gear-history',
 'compare-catalog','save-reviewed-snapshot','save-rotated-session'
])
/** Strict exception class mapping; NEVER log message, cause, URL, headers or body. */
export function safeGarminFailureKind(error) {
  if(!error||typeof error!=='object')return {kind:'unknown',status:null}
  const name=error.name
  if(name==='GarminAuthError')return {kind:'auth-rejected',status:null}
  if(name==='GarminRateLimitError')return {kind:'rate-limited',status:429}
  if(name==='GarminConnectionError')return {kind:'network-or-timeout',status:null}
  if(name==='GarminHttpError'){
    const status=error.status
    return {kind:'http-error',status:Number.isInteger(status)&&status>=400&&status<=599?status:null}
  }
  if(name==='SyntaxError')return {kind:'invalid-json-response',status:null}
  return {kind:'unknown',status:null}
}
const kinds=new Set(['auth-rejected','rate-limited','network-or-timeout','http-error','invalid-json-response','unknown'])
export function safeAuditDiagnostic(stage,httpStatus=null,failureKind='unknown') {
 const phase=phases.has(stage)?stage:'unclassified'
 const kind=kinds.has(failureKind)?failureKind:'unknown'
 const status=Number.isInteger(httpStatus)&&httpStatus>=400&&httpStatus<=599?
   ' (HTTP '+httpStatus+')':''
 return 'GARMIN CLOUD DATA AUDIT: stopped at '+phase+' ['+kind+']'+status+
   '. Gear, calendar and weight records were not changed.'
}

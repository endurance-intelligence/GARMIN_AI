/** 
 * Diagnostic only. Accepts a strict static phase/status allowlist.
 * Never format SDK exception messages, headers, IDs, profile data or tokens.
 */
const phases=new Set([
 'github-oidc','supabase-vault-read','load-garmin-session','load-baseline',
 'garmin-profile','garmin-gear','garmin-calendar','garmin-gear-history',
 'compare-catalog','save-rotated-session'
])
export function safeAuditDiagnostic(stage,httpStatus=null) {
 const phase=phases.has(stage)?stage:'unclassified'
 const status=Number.isInteger(httpStatus)&&httpStatus>=400&&httpStatus<=599?
   ' (HTTP '+httpStatus+')':''
 return 'GARMIN CLOUD DATA AUDIT: stopped at '+phase+status+
   '. Gear, calendar and weight records were not changed.'
}

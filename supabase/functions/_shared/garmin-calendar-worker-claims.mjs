/** Exact identity allowlist, used only AFTER GitHub RS256/JWKS verification. */
export function trustedCalendarWorkflowClaims(p){
 return !!p&&
  p.repository==='endurance-intelligence/GARMIN_AI'&&
  String(p.repository_id)==='1443154844'&&
  p.ref==='refs/heads/main'&&
  p.ref_type==='branch'&&
  p.workflow_ref==='endurance-intelligence/GARMIN_AI/.github/workflows/garmin-calendar-delivery.yml@refs/heads/main'&&
  p.runner_environment==='github-hosted'&&
  p.event_name==='workflow_dispatch'
}

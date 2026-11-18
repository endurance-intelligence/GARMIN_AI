/**
 * Strict identity allowlist, on top of cryptographic JWT signature validation.
 * This does not itself verify a signature; the Edge function MUST use jwtVerify.
 */
export function trustedGarminWorkerClaims(payload) {
  return !!payload &&
    payload.repository==='endurance-intelligence/GARMIN_AI' &&
    String(payload.repository_id)==='1443154844' &&
    payload.ref==='refs/heads/main' &&
    payload.ref_type==='branch' &&
    payload.workflow_ref==='endurance-intelligence/GARMIN_AI/.github/workflows/garmin-cloud-audit.yml@refs/heads/main' &&
    payload.runner_environment==='github-hosted' &&
    (payload.event_name==='schedule'||payload.event_name==='workflow_dispatch')
}

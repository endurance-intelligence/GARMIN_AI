/**
 * GARMIN_AI v0.9.1: exact GitHub-hosted weight workflow identity.
 * IMPORTANT: caller must cryptographically verify GitHub JWT signature,
 * issuer, algorithm and audience before using this predicate.
 */
export function trustedWeightWorkflowClaims(p) {
  return !!p &&
    p.repository==='endurance-intelligence/GARMIN_AI' &&
    String(p.repository_id)==='1443154844' &&
    p.ref==='refs/heads/main' && p.ref_type==='branch' &&
    p.workflow_ref==='endurance-intelligence/GARMIN_AI/.github/workflows/garmin-weight-delivery.yml@refs/heads/main' &&
    p.runner_environment==='github-hosted' &&
    p.event_name==='workflow_dispatch'
}

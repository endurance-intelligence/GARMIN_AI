import test from 'node:test'
import assert from 'node:assert/strict'
import {trustedGarminWorkerClaims} from '../supabase/functions/_shared/garmin-worker-claims.mjs'

const trusted=()=>({
  repository:'endurance-intelligence/GARMIN_AI',repository_id:'1443154844',
  ref:'refs/heads/main',ref_type:'branch',
  workflow_ref:'endurance-intelligence/GARMIN_AI/.github/workflows/garmin-cloud-audit.yml@refs/heads/main',
  runner_environment:'github-hosted',event_name:'workflow_dispatch'
})
test('only exact scheduled or manually triggered trusted GitHub workflow may read Vault',()=>{
 assert.equal(trustedGarminWorkerClaims(trusted()),true)
 assert.equal(trustedGarminWorkerClaims({...trusted(),event_name:'schedule'}),true)
})
test('reject external repositories, forks, other branch and other workflows',()=>{
 for(const changes of [
  {repository:'attacker/GARMIN_AI'}, {repository_id:'123'},
  {ref:'refs/heads/feature/evil'}, {ref_type:'tag'},
  {workflow_ref:'endurance-intelligence/GARMIN_AI/.github/workflows/evil.yml@refs/heads/main'},
  {runner_environment:'self-hosted'}, {event_name:'pull_request'}, {event_name:'push'}
 ]) assert.equal(trustedGarminWorkerClaims({...trusted(),...changes}),false)
})
test('unknown identity is denied',()=>{
 assert.equal(trustedGarminWorkerClaims(null),false)
 assert.equal(trustedGarminWorkerClaims({}),false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {trustedWeightWorkflowClaims} from '../supabase/functions/_shared/garmin-weight-worker-claims.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const claims=()=>({
  repository:'endurance-intelligence/GARMIN_AI',
  repository_id:'1443154844',
  ref:'refs/heads/main',ref_type:'branch',
  workflow_ref:'endurance-intelligence/GARMIN_AI/.github/workflows/garmin-weight-delivery.yml@refs/heads/main',
  runner_environment:'github-hosted',event_name:'workflow_dispatch'
})
test('only exact GitHub-hosted manual weight workflow on main is accepted',()=>{
  assert.equal(trustedWeightWorkflowClaims(claims()),true)
  for(const modify of [
    {repository:'attacker/GARMIN_AI'}, {repository_id:'123'},
    {ref:'refs/heads/feature/run'}, {ref_type:'tag'},
    {event_name:'pull_request'}, {event_name:'schedule'}, {event_name:'push'},
    {runner_environment:'self-hosted'},
    {workflow_ref:'endurance-intelligence/GARMIN_AI/.github/workflows/garmin-cloud-audit.yml@refs/heads/main'}
  ])assert.equal(trustedWeightWorkflowClaims({...claims(),...modify}),false)
  assert.equal(trustedWeightWorkflowClaims(null),false)
})

test('OIDC signature and audience verified inside Supabase before service role RPC',()=>{
  const edge=read('supabase/functions/garmin-weight-worker/index.ts')
  assert.match(edge,/createRemoteJWKSet\(/)
  assert.match(edge,/jwtVerify\(identity\[1\],keys/)
  assert.match(edge,/algorithms:\['RS256'\]/)
  assert.match(edge,/trustedWeightWorkflowClaims\(payload\)/)
  assert.match(edge,/if\(req\.headers\.has\('origin'\)\)/)
  assert.match(edge,/const authorizedForWrites=enabled\(\)&&liveRequested/)
})

test('default dry run never returns OAuth tokens or allows mutation',()=>{
  const edge=read('supabase/functions/garmin-weight-worker/index.ts')
  const first=edge.indexOf('if(!authorizedForWrites)return reply(200,')
  const oauth=edge.indexOf("db.rpc('garmin_connect_session_get')")
  assert.ok(first>=0&&first<oauth)
  assert.match(edge,/if\(!authorizedForWrites\)return reply\(403/)
  assert.match(edge,/GARMIN_WEIGHT_WRITES_ENABLED/)
  const worker=read('scripts/cloud/run-garmin-weight-delivery.mjs')
  assert.match(worker,/const localEnabled=process\.env\.GARMIN_WEIGHT_WRITES_ENABLED==='true'/)
  assert.match(worker,/if\(!localEnabled\|\|payload\?\.writerEnabled!==true\)/)
  assert.match(worker,/'x-garmin-weight-active':process\.env\.GARMIN_WEIGHT_WRITES_ENABLED==='true'\?'true':'false'/)
})

test('worker does not schedule itself, and does not hide 429 by retrying',()=>{
  const worker=read('scripts/cloud/run-garmin-weight-delivery.mjs')
  assert.match(worker,/retries:0/)
  assert.match(worker,/deliverOneWeight\(\{db,garmin,writesEnabled:true\}\)/)
  assert.match(worker,/no automatic retry/)
  assert.doesNotMatch(worker,/console\.log\([^\n]*(?:tokens|weight_kg|access_token)/i)
  const config=read('supabase/config.toml')
  assert.match(config,/\[functions\.garmin-weight-worker\]/)
  assert.match(config,/verify_jwt = false/)
})

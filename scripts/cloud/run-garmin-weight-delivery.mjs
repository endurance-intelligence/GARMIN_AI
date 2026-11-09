/**
 * GARMIN_AI v0.9.1 – manual, single-record cloud weight worker.
 * Both independent feature flags must be true before any Garmin request.
 * No schedule, no retry, no log of account, date, mass or OAuth tokens.
 */
import {GarminClient,Garmin,MemoryTokenStore} from 'garminconnect-js'
import {isGarminCloudSession,tokenChanged} from './garmin-cloud-session.mjs'
import {deliverOneWeight} from './garmin-weight-delivery.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const audience='garmin-ai-weight:eurgupsebxypjqvyizci'
const url=project+'/functions/v1/garmin-weight-worker'

async function identity(){
  const source=process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if(!source||!requestToken)throw Error('Missing GitHub OIDC environment')
  const target=new URL(source)
  if(target.protocol!=='https:')throw Error('Invalid GitHub OIDC endpoint')
  target.searchParams.set('audience',audience)
  const res=await fetch(target,{
    headers:{authorization:'Bearer '+requestToken},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)
  })
  if(!res.ok)throw Error('GitHub identity unavailable')
  const data=await res.json()
  if(typeof data?.value!=='string'||data.value.split('.').length!==3)
    throw Error('GitHub identity invalid')
  return data.value
}
async function call(jwt,body){
  const res=await fetch(url,{
    method:body?'POST':'GET',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(20000),
    headers:{
      authorization:'Bearer '+jwt,
      ...(body?{'content-type':'application/json'}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  })
  // Never print upstream response or error: it may contain sensitive data.
  if(!res.ok)throw Error('Private weight gateway failed, status '+res.status)
  return res.json()
}
async function main(){
  const jwt=await identity()
  const payload=await call(jwt)
  const localEnabled=process.env.GARMIN_WEIGHT_WRITES_ENABLED==='true'
  if(!localEnabled||payload?.writerEnabled!==true){
    console.log('GARMIN_WEIGHT: dry-run; writes disabled; pending='+
      (payload?.pendingAvailable===true?'yes':'no'))
    return
  }
  if(payload.pendingAvailable!==true){
    console.log('GARMIN_WEIGHT: queue empty')
    return
  }
  if(!Number.isSafeInteger(payload.version)||payload.version<1||
     !isGarminCloudSession(payload.tokens)||!payload.pending?.available)
    throw Error('Cloud session or pending record unavailable')

  const original=payload.tokens
  const store=new MemoryTokenStore()
  await store.save(original)
  const client=new GarminClient({tokenStore:store,timeoutMs:15000,retries:0})
  if(!await client.loadTokens())throw Error('Cloud Garmin session unavailable')
  const garmin=new Garmin(client)

  const db={
    async nextPending(){return payload.pending},
    async claim(date,kg,revision){
      return call(jwt,{action:'claim',date,kg,revision})
    },
    async confirmExisting(date,kg,revision){
      return call(jwt,{action:'confirm-existing',date,kg,revision})
    },
    async finish(date,attemptId,status,code){
      return call(jwt,{action:'finish',date,attemptId,status,code})
    }
  }
  let failed=false
  try {
    const outcome=await deliverOneWeight({db,garmin,writesEnabled:true})
    // These fixed strings are the only worker output; never log masses,
    // dates, body responses, SQL details or Garmin SDK exceptions.
    const statuses=new Set(['idle','blocked','preview','confirmed','needs_review'])
    const codes=new Set([
      'no_pending_weight','invalid_pending_record','invalid_local_entry',
      'invalid_garmin_day','empty_day_verified','matching_remote_weight',
      'different_remote_weight','multiple_remote_entries',
      'write_not_visible','verified_read_back','rate_limited',
      'auth_rejected','network_uncertain','write_error',
      'concurrent_change','outbox_finish_failed','missing_private_adapters'
    ])
    console.log('GARMIN_WEIGHT: '+(statuses.has(outcome.state)?outcome.state:'blocked')+
      ' ('+(codes.has(outcome.code)?outcome.code:'unknown')+')')
    if(!['confirmed','idle'].includes(outcome.state))failed=true
  } finally {
    // Token refresh may occur during a READ or WRITE. Preserve it in Vault
    // even if a later request failed, using the existing CAS version.
    const after=client.getTokens()
    if(after&&isGarminCloudSession(after)&&tokenChanged(original,after)){
      const saved=await call(jwt,{action:'rotate',
        expectedVersion:payload.version,tokens:after})
      if(saved?.saved!==true)throw Error('Vault token rotation could not be confirmed')
    }
  }
  if(failed)process.exitCode=1
}
main().catch(()=>{
  console.error('GARMIN_WEIGHT: private worker stopped; no automatic retry')
  process.exitCode=1
})

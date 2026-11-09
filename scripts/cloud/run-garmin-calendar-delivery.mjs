/** GARMIN_AI v0.9.5 – manual, one-workout calendar delivery (locked).
 * Signed GitHub OIDC; no service-role secrets; never logs user plans/tokens.
 */
import {GarminClient,Garmin,MemoryTokenStore} from 'garminconnect-js'
import {isGarminCloudSession,tokenChanged} from './garmin-cloud-session.mjs'
import {deliverOneCalendarWorkout} from './garmin-calendar-delivery.mjs'

const project='https://eurgupsebxypjqvyizci.supabase.co'
const worker=project+'/functions/v1/garmin-calendar-worker'
const audience='garmin-ai-calendar:eurgupsebxypjqvyizci'

async function identity(){
 const source=process.env.ACTIONS_ID_TOKEN_REQUEST_URL
 const secret=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
 if(!source||!secret)throw Error('GitHub workflow identity unavailable')
 const url=new URL(source)
 if(url.protocol!=='https:')throw Error('Unexpected GitHub OIDC endpoint')
 url.searchParams.set('audience',audience)
 const r=await fetch(url,{
  headers:{authorization:'Bearer '+secret},redirect:'error',
  cache:'no-store',signal:AbortSignal.timeout(15000)
 })
 if(!r.ok)throw Error('GitHub workflow identity rejected')
 const payload=await r.json()
 if(typeof payload?.value!=='string'||payload.value.split('.').length!==3)
  throw Error('GitHub workflow identity malformed')
 return payload.value
}
async function call(jwt,payload){
 const r=await fetch(worker,{
  method:payload?'POST':'GET',redirect:'error',cache:'no-store',
  signal:AbortSignal.timeout(20000),
  headers:{
   authorization:'Bearer '+jwt,
   'x-garmin-calendar-active':process.env.GARMIN_CALENDAR_WRITES_ENABLED==='true'?'true':'false',
   ...(payload?{'content-type':'application/json'}:{})
  },
  ...(payload?{body:JSON.stringify(payload)}:{})
 })
 if(!r.ok)throw Error('Private calendar gateway status '+r.status)
 return r.json()
}

async function main(){
 const jwt=await identity()
 const response=await call(jwt)
 const locallyEnabled=process.env.GARMIN_CALENDAR_WRITES_ENABLED==='true'
 if(!locallyEnabled||response?.writerEnabled!==true){
   console.log('GARMIN_CALENDAR: dry-run; writes disabled; pending='+
    (response?.pendingAvailable===true?'yes':'no'))
   return
 }
 if(response.pendingAvailable!==true){
  console.log('GARMIN_CALENDAR: no approved workout pending')
  return
 }
 if(!Number.isSafeInteger(response.version)||response.version<1||
    !isGarminCloudSession(response.tokens)||response.pending?.available!==true)
   throw Error('Private Garmin calendar session unavailable')

 const original=response.tokens
 const store=new MemoryTokenStore()
 await store.save(original)
 const client=new GarminClient({tokenStore:store,timeoutMs:15000,retries:0})
 if(!await client.loadTokens())throw Error('Cloud Garmin token loading failed')
 const garmin=new Garmin(client)
 const db={
  nextPending:async()=>response.pending,
  claim:async task=>call(jwt,{action:'claim',...task}),
  confirmExisting:async(task,remoteId)=>
    call(jwt,{action:'confirm-existing',...task,remoteId}),
  finish:async(task,attemptId,decision)=>
    call(jwt,{action:'finish',id:task.id,attemptId,
      status:decision.status,code:decision.code,remoteId:decision.remoteId})
 }
 let failed=false
 try{
  const outcome=await deliverOneCalendarWorkout({
   db,garmin,writesEnabled:true,
   wait:()=>new Promise(resolve=>setTimeout(resolve,6000))
  })
  if(outcome.code==='rate_limited'){
   const guard=await call(jwt,{action:'rate-limit'})
   if(guard?.recorded!==true)throw Error('Garmin OAuth guard update failed')
  }
  const states=new Set(['idle','blocked','preview','confirmed','needs_review'])
  const codes=new Set([
   'queue_empty','missing_private_adapters','invalid_pending','already_present',
   'no_matching_workout','safe_to_write','concurrent_change','multiple_matches',
   'unexpected_remote_shape','write_not_visible','verified_read_back',
   'read_unavailable','write_unavailable','rate_limited','auth_rejected',
   'network_uncertain','outbox_finish_failed'
  ])
  console.log('GARMIN_CALENDAR: '+(states.has(outcome.state)?outcome.state:'blocked')+
   ' ('+(codes.has(outcome.code)?outcome.code:'unknown')+')')
  if(!['confirmed','idle'].includes(outcome.state))failed=true
 }finally{
  // Garmin may rotate tokens on read or write. Preserve without disclosing.
  const after=client.getTokens()
  if(after&&isGarminCloudSession(after)&&tokenChanged(original,after)){
   const saved=await call(jwt,{action:'rotate',
      tokens:after,expectedVersion:response.version})
   if(saved?.saved!==true)throw Error('Garmin OAuth token rotation not confirmed')
  }
 }
 if(failed)process.exitCode=1
}
main().catch(()=>{
 console.error('GARMIN_CALENDAR: private worker stopped; no automatic retry')
 process.exitCode=1
})

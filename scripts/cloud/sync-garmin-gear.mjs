/** GARMIN_AI v0.9.45 – bounded, read-only Garmin shoe association reconciliation.
 * GitHub-hosted Node only; OIDC-verified workflow and Supabase Vault session.
 * No Garmin writes, no secrets in logs, no automatic guess from default shoes.
 */
import {GarminClient,Garmin,MemoryTokenStore} from 'garminconnect-js'
import {isGarminCloudSession,tokenChanged} from './garmin-cloud-session.mjs'
import {readActivityGear,validActivityId} from '../../supabase/functions/_shared/garmin-gear-incremental.mjs'
import {safeAuditDiagnostic,safeGarminFailureKind} from './safe-audit-diagnostic.mjs'
const url='https://eurgupsebxypjqvyizci.supabase.co/functions/v1/garmin-cloud-worker'
const audience='garmin-ai-cloud-audit:eurgupsebxypjqvyizci'
let phase='github-oidc',httpStatus=null,kind='unknown'
const mark=where=>{phase=where;httpStatus=null;kind='unknown'}
async function identity(){
 const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL
 const secret=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
 if(!endpoint||!secret)throw Error('GitHub identity unavailable')
 const target=new URL(endpoint)
 if(target.protocol!=='https:')throw Error('Invalid identity endpoint')
 target.searchParams.set('audience',audience)
 const r=await fetch(target,{cache:'no-store',redirect:'error',
  headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(15000)})
 if(!r.ok){httpStatus=r.status;throw Error('GitHub identity request unavailable')}
 const data=await r.json()
 if(typeof data.value!=='string'||data.value.split('.').length!==3)
  throw Error('No verified identity')
 return data.value
}
async function bridge(jwt,method,data=null){
 const response=await fetch(url,{method,redirect:'error',cache:'no-store',
  headers:{authorization:'Bearer '+jwt,...(data?{'content-type':'application/json'}:{})},
  ...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)})
 if(!response.ok){httpStatus=response.status;throw Error('Private bridge rejected request')}
 return response.json()
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function main(){
 mark('github-oidc')
 const jwt=await identity()
 mark('supabase-vault-read')
 const credentials=await bridge(jwt,'GET')
 if(!isGarminCloudSession(credentials?.tokens)||!Number.isSafeInteger(credentials.version)||
  !credentials.baseline?.synced_at||!Array.isArray(credentials.baseline.gear)||
  !Array.isArray(credentials.incrementalTargets)||credentials.incrementalTargets.length>30)
  throw Error('Cloud gear prerequisites unavailable')
 const targets=credentials.incrementalTargets
 if(targets.some(x=>!validActivityId(x?.activityId)))throw Error('Invalid gear scan targets')
 if(!targets.length){
  console.log('GARMIN GEAR SYNC: no new or recently changed running activities')
  return
 }
 console.log('GARMIN GEAR SYNC: reconciling',targets.length,'running activities')
 mark('garmin-load-session')
 const store=new MemoryTokenStore()
 await store.save(credentials.tokens)
 const client=new GarminClient({tokenStore:store,timeoutMs:15000,retries:0})
 if(!await client.loadTokens())throw Error('Saved cloud session unavailable')
 const garmin=new Garmin(client)
 let reports=null
 try{
  mark('garmin-oauth-refresh')
  try {await client.refreshTokens()}
  catch(e){
   const v=safeGarminFailureKind(e);httpStatus=v.status;kind=v.kind;throw e
  }
  mark('garmin-activity-gear')
  const read=[]
  for(const activity of targets){
   let raw
   try{raw=await garmin.getActivityGear(activity.activityId)}
   catch(e){
    const v=safeGarminFailureKind(e);httpStatus=v.status;kind=v.kind;throw e
   }
   const gearIds=readActivityGear(raw,credentials.baseline.gear)
   read.push({activityId:activity.activityId,gearIds})
   if(read.length<targets.length)await pause(600)
  }
  reports=read
 }finally{
  // OAuth tokens can rotate during any read. Preserve them even if one
  // later activity had an incomplete Garmin response; never print tokens.
  const after=client.getTokens()
  if(after&&isGarminCloudSession(after)&&tokenChanged(credentials.tokens,after)){
   mark('save-rotated-session')
   const saved=await bridge(jwt,'POST',{tokens:after,expectedVersion:credentials.version})
   if(saved?.saved!==true)throw Error('OAuth refresh state not persisted')
  }
 }
 if(!reports||reports.length!==targets.length)throw Error('Incomplete verified scan')
 mark('supabase-save-associations')
 const result=await bridge(jwt,'POST',{action:'incremental-gear',
  expectedSyncedAt:credentials.baseline.synced_at,reports})
 if(result?.saved!==true||result?.garminWritten!==false)
  throw Error('Gear reconciliation not confirmed')
 console.log('GARMIN GEAR SYNC: saved',result.verified,'verified running activities')
 console.log('New associations:',result.added,'Removed/reassigned associations:',result.removed)
 console.log('Total confirmed association pairs:',result.total)
 console.log('No Garmin data changed, no shoe inferred, no historic records discarded.')
}
main().catch(()=>{
 console.error(safeAuditDiagnostic(phase,httpStatus,kind))
 process.exitCode=1
})

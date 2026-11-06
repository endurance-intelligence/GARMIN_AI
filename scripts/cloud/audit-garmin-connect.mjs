/**
 * GARMIN_AI v0.7.7: read-only, complete cloud gear & training-calendar audit.
 * Runs on a GitHub-hosted runner with short-lived GitHub OIDC identity.
 * Supabase service-role credentials remain exclusively inside Supabase.
 *
 * Reads only. Existing 411 gear assignments, calendar and weight outbox
 * remain intact. Stores refreshed OAuth tokens in Vault if Garmin rotated them.
 */
import {GarminClient,Garmin,MemoryTokenStore} from 'garminconnect-js'
import {isGarminCloudSession,tokenChanged} from './garmin-cloud-session.mjs'
import {buildCloudPreview} from './garmin-cloud-data-audit-model.mjs'

const ref='eurgupsebxypjqvyizci'
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const required=name=>{
  const value=process.env[name]
  if(!value)throw Error('Missing private runtime setting: '+name)
  return value
}

const AUDIENCE='garmin-ai-cloud-audit:eurgupsebxypjqvyizci'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const workerUrl=project+'/functions/v1/garmin-cloud-worker'

async function githubIdentityToken() {
  const url=required('ACTIONS_ID_TOKEN_REQUEST_URL')
  const requestToken=required('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
  const target=new URL(url)
  if(target.protocol!=='https:')throw Error('Invalid GitHub OIDC URL')
  target.searchParams.set('audience',AUDIENCE)
  const res=await fetch(target,{
    headers:{authorization:'Bearer '+requestToken},
    signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'
  })
  if(!res.ok)throw Error('GitHub OIDC token request failed')
  const body=await res.json()
  if(typeof body?.value!=='string'||body.value.split('.').length!==3)
    throw Error('GitHub OIDC token missing')
  return body.value
}
async function workerCall(jwt,method,body) {
  const res=await fetch(workerUrl,{
    method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),
    headers:{
      authorization:'Bearer '+jwt,
      ...(body?{'content-type':'application/json'}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  })
  if(!res.ok)throw Error('Private Supabase worker authorization or storage failed')
  return res.json()
}
async function main(){
  // No long-lived Supabase service-role key is ever placed in GitHub.
  const jwt=await githubIdentityToken()
  const credential=await workerCall(jwt,'GET')
  if(!credential||!Number.isSafeInteger(credential.version)||
     credential.version<=0||!isGarminCloudSession(credential.tokens))
    throw Error('Cloud Garmin session unavailable')

  const store=new MemoryTokenStore()
  await store.save(credential.tokens)
  const client=new GarminClient({tokenStore:store,timeoutMs:15000,retries:0})
  if(!await client.loadTokens())throw Error('Cloud session cannot be loaded')
  const garmin=new Garmin(client)
  let completed=false
  try{
    const baseline=credential.baseline
    if(!baseline||baseline.activity_gear_scope!=='complete')
      throw Error('Verified Garmin baseline missing')

    const profile=await garmin.getUserProfile()
    if(!Number.isSafeInteger(profile?.profileId))
      throw Error('Garmin user profile not recognized')
    const rawGear=await garmin.getGear(profile.profileId)
    if(!Array.isArray(rawGear)||rawGear.length<1||rawGear.length>100)
      throw Error('Garmin gear catalog shape unavailable')

    const start=new Date(Date.now()-14*86400_000).toISOString().slice(0,10)
    const end=new Date(Date.now()+42*86400_000).toISOString().slice(0,10)
    const rawCalendar=await garmin.getScheduledWorkoutSummaries(start,end)

    const ids=rawGear.map(g=>g?.uuid??g?.gearUUID??g?.gearUuid??g?.gearId)
    if(ids.some(id=>typeof id!=='string'))
      throw Error('Garmin gear IDs missing')
    const activityLists=[]
    for(let i=0;i<ids.length;i++){
      // The full current catalog, including retired gear, must be scanned:
      // a reassignment removes an old pair as well as adding a new pair.
      activityLists.push(await garmin.getGearActivities(ids[i],1000))
      if(i+1<ids.length)await wait(700)
    }
    const preview=buildCloudPreview({rawGear,rawCalendar,activityLists,baseline})
    completed=true
    console.log('GARMIN CLOUD DATA AUDIT: VERIFIED')
    console.log('Gear scanned:',preview.totals.gear)
    console.log('Known associations:',preview.totals.links)
    console.log('Calendar items in audit window:',preview.totals.scheduled)
    console.log('Changes (+/-) links:',preview.differences.linksAdded,'/',preview.differences.linksRemoved)
    console.log('Changes (+/-) calendar:',preview.differences.calendarAdded,'/',preview.differences.calendarRemoved)
    console.log('Garmin read-only; no equipment, calendar or weight data modified.')
  } finally {
    // Garmin can rotate OAuth2 during ANY read. Persist the new session
    // even if a later data request failed, to keep the next check functional.
    const after=client.getTokens()
    if(after&&isGarminCloudSession(after)&&tokenChanged(credential.tokens,after)){
      const saved=await workerCall(jwt,'POST',{
        tokens:after,expectedVersion:credential.version
      })
      if(!saved?.saved)throw Error('Garmin token refresh not persisted safely')
    }
    if(!completed)console.error('GARMIN CLOUD DATA AUDIT: incomplete; no data overwritten.')
  }
}
main().catch(()=>{
  // Do not print raw SDK exceptions, account data or OAuth access tokens.
  console.error('GARMIN CLOUD DATA AUDIT: failed. Investigate the private worker logs.')
  process.exitCode=1
})

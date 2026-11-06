/**
 * GARMIN_AI v0.7.7: read-only, complete cloud gear & training-calendar audit.
 * Runs in trusted Node.js hosting with private Supabase credentials. The
 * project does not yet have a provisioned/scheduled cloud runner.
 *
 * Reads only. Existing 411 gear assignments, calendar and weight outbox
 * remain intact. Stores refreshed OAuth tokens in Vault if Garmin rotated them.
 */
import {createClient} from '@supabase/supabase-js'
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

async function main(){
  const endpoint=required('SUPABASE_URL').replace(/\/$/,'')
  if(endpoint!==`https://${ref}.supabase.co`)throw Error('Wrong Supabase project')
  const supabase=createClient(endpoint,required('SUPABASE_SERVICE_ROLE_KEY'),{
    auth:{persistSession:false,autoRefreshToken:false}
  })
  const {data:credential,error:readError}=await supabase.rpc('garmin_connect_session_get')
  if(readError||!credential?.connected||
      !Number.isSafeInteger(credential.version)||credential.version<=0||
      !isGarminCloudSession(credential.tokens))
    throw Error('Cloud session unavailable or invalid')

  const store=new MemoryTokenStore()
  await store.save(credential.tokens)
  const client=new GarminClient({tokenStore:store,timeoutMs:15000,retries:0})
  if(!await client.loadTokens())throw Error('Cloud session cannot be loaded')
  const garmin=new Garmin(client)
  let completed=false
  try{
    const {data:baseline,error:baselineError}=await supabase.from('garmin_connect_snapshot')
      .select('gear,schedule,activity_gear,activity_gear_scope,synced_at')
      .eq('snapshot_key','primary').maybeSingle()
    if(baselineError||!baseline||baseline.activity_gear_scope!=='complete')
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
      const {data:saved,error:saveError}=await supabase.rpc('garmin_connect_session_store',{
        p_tokens:after,p_expected_version:credential.version
      })
      if(saveError||!saved?.saved)
        throw Error('Garmin token refresh not persisted safely')
    }
    if(!completed)console.error('GARMIN CLOUD DATA AUDIT: incomplete; no data overwritten.')
  }
}
main().catch(()=>{
  // Do not print raw SDK exceptions, account data or OAuth access tokens.
  console.error('GARMIN CLOUD DATA AUDIT: failed. Investigate the private worker logs.')
  process.exitCode=1
})

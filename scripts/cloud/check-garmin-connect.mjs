/**
 * GARMIN_AI v0.7.6: headless READ-ONLY cloud session verification.
 *
 * Run only in a trusted Node.js runtime (Node >= 24 recommended) with
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set as server-side secrets.
 * No local Garmin credentials needed once a session is explicitly installed.
 * DO NOT print the service role key, OAuth tokens or Garmin profile.
 *
 * This is a smoke test, not yet an unattended scheduler or a weight writer.
 */
import {createClient} from '@supabase/supabase-js'
import {GarminClient,Garmin,MemoryTokenStore} from 'garminconnect-js'
import {isGarminCloudSession,tokenChanged} from './garmin-cloud-session.mjs'

const project='eurgupsebxypjqvyizci'
function required(name) {
  const v=process.env[name]
  if(!v)throw Error(name+' is not configured in the server runtime')
  return v
}

async function main() {
  const url=required('SUPABASE_URL').replace(/\/$/,'')
  if(url!==`https://${project}.supabase.co`)
    throw Error('Unexpected Supabase project URL')
  const key=required('SUPABASE_SERVICE_ROLE_KEY')
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})

  const {data:state,error:readError}=await db.rpc('garmin_connect_session_get')
  if(readError||!state?.connected)throw Error('Cloud Garmin session not installed')
  if(!Number.isSafeInteger(state.version)||state.version<1||
    !isGarminCloudSession(state.tokens))throw Error('Invalid Vault Garmin session')

  const store=new MemoryTokenStore()
  await store.save(state.tokens)
  const client=new GarminClient({tokenStore:store,timeoutMs:12000,retries:0})
  if(!await client.loadTokens())throw Error('Vault token loading failed')
  const garmin=new Garmin(client)
  // Private read proves the remote session is usable, without disclosing
  // profile data in logs or persisting new user data.
  await garmin.getUserProfile()

  const after=client.getTokens()
  if(!after||!isGarminCloudSession(after))throw Error('Garmin session missing after read')

  if(tokenChanged(state.tokens,after)){
    // Garmin may rotate OAuth2 tokens. Save them back to encrypted Vault
    // using the expected version, so a parallel worker cannot silently
    // overwrite newer session credentials.
    const {data:saved,error:writeError}=await db.rpc('garmin_connect_session_store',{
      p_tokens:after,p_expected_version:state.version
    })
    if(writeError||!saved?.saved)throw Error('Cloud Garmin token refresh not persisted')
    console.log('GARMIN CLOUD CONNECTION: verified (session rotated)')
  } else {
    console.log('GARMIN CLOUD CONNECTION: verified (read-only)')
  }
}

main().catch(()=>{
  // Never stringify Garmin or Supabase client errors; they can contain
  // transport metadata and sensitive identifiers.
  console.error('GARMIN CLOUD CONNECTION: unavailable. Check private server logs and Vault setup.')
  process.exitCode=1
})

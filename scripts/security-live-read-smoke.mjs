import assert from 'node:assert/strict'
import {isPublicConfig} from './validate-public-config.mjs'
const url=process.env.VITE_GARMIN_SUPABASE_URL
const key=process.env.VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY
assert.ok(isPublicConfig(url,key),'publishable-only configuration required')
const origin='https://endurance-intelligence.github.io'
const endpoints=['garmin-app-access','read-garmin-health','read-garmin-session','garmin-coach-archive','garmin-training-plan','garmin-sync-center','garmin-intervals','garmin-training-history']
async function check(path,headers,acceptable){
 const response=await fetch(url+path,{method:'GET',redirect:'error',cache:'no-store',headers:{apikey:key,origin,...headers},signal:AbortSignal.timeout(15000)})
 const status=response.status
 // Never log response payloads, credentials or owner data.
 await response.body?.cancel()
 assert.ok(acceptable.includes(status),path+' returned unexpected HTTP '+status)
 return status
}
for(const endpoint of endpoints){
 const path='/functions/v1/'+endpoint
 const anonymous=await check(path,{},[401,403])
 const invalid=await check(path,{authorization:'Bearer not-a-valid-session'},[401,403])
 console.log(endpoint+': anonymous '+anonymous+', invalid '+invalid)
}
for(const table of ['garmin_activities','garmin_daily_metrics','garmin_training_plan','garmin_weekly_plan_history']){
 const status=await check('/rest/v1/'+table+'?select=*&limit=1',{},[401,403,404])
 console.log(table+': direct anonymous read denied '+status)
}
console.log('Live read-only access denial smoke passed.')

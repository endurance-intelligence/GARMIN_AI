import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
import type {HealthPreferences} from './healthPreferences.mjs'
export type HealthPreferencesResponse={preferences:HealthPreferences;reminderDue:boolean;date:string;saved?:boolean;status?:string;candidate?:Pick<HealthPreferences,'heightCm'|'birthYear'>}
export async function healthPreferencesRequest(body?:Record<string,unknown>,signal?:AbortSignal){
 const session=(await garminSupabase?.auth.getSession())?.data.session
 if(!session)throw Error('Anmeldung erforderlich')
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-athlete-profile?health=1',{method:body?'POST':'GET',cache:'no-store',signal,headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,confirm:true})}:{})})
 const data=await response.json()
 if(!response.ok)throw Error(data.error||'Gesundheitsprofil nicht erreichbar')
 return data as HealthPreferencesResponse
}

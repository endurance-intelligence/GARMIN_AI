import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
import type {AthleteProfile} from './athleteProfile.mjs'
export async function athleteProfileRequest(body?:Record<string,unknown>,signal?:AbortSignal){
 if(!garminSupabase)throw Error('Anmeldung erforderlich')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Anmeldung erforderlich')
 const r=await fetch(garminSupabaseUrl+'/functions/v1/garmin-athlete-profile',{method:body?'POST':'GET',cache:'no-store',signal,headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const d=await r.json()
 if(!r.ok)throw Error(d.error||'Profil nicht erreichbar')
 return d as {profile:AthleteProfile|null;saved?:boolean;garminKeyConfigured?:boolean;status?:string}
}

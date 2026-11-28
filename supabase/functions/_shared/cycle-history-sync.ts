import {cycleToday,normalizeCycleObservation,trimCycleHistory} from '../../../src/lib/cycleHistory.mjs'
import type {createClient} from 'npm:@supabase/supabase-js@2'
type Admin=ReturnType<typeof createClient>
type GarminFetch=(url:string,init:RequestInit)=>Promise<Response>
// Only called after cron or owner authorization. Never log raw data or send it to cron callers.
export async function syncCycleHistory(db:Admin,ownerId:string,fetcher:GarminFetch,token:string){
 const today=cycleToday()
 const {data:row,error}=await db.from('garmin_cycle_history').select('enabled,generation,last_attempt_on,observations').eq('user_id',ownerId).maybeSingle()
 if(error||row?.enabled!==true||row.last_attempt_on===today)return
 const prior=trimCycleHistory(row.observations,today)
 const {data:claim,error:claimError}=await db.from('garmin_cycle_history').update({last_attempt_on:today,status:'pending',observations:prior,updated_at:new Date().toISOString()}).eq('user_id',ownerId).eq('enabled',true).eq('generation',row.generation).or('last_attempt_on.is.null,last_attempt_on.lt.'+today).select('generation').maybeSingle()
 if(claimError||!claim)return
 let observation=null
 try{
  const response=await fetcher('https://personal.connectapi.garmin.com/periodichealth-service/menstrualcycle/summary/'+today,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})
  if(response.ok&&response.status!==204)observation=normalizeCycleObservation(await response.json(),today)
 }catch{/* no raw data or errors leave this import */}
 const observations=trimCycleHistory(observation?[...prior,observation]:prior,today)
 // A revoke/re-enable changes generation; an in-flight response cannot restore erased data.
 await db.from('garmin_cycle_history').update({observations,status:observation?'stored':'unavailable',updated_at:new Date().toISOString()}).eq('user_id',ownerId).eq('enabled',true).eq('generation',claim.generation).eq('last_attempt_on',today)
}
export async function syncConsentedCycle(db:Admin,ownerEmail:string,fetcher:GarminFetch,token:string){
 if(!ownerEmail)return
 const {data:rows,error}=await db.from('garmin_cycle_history').select('user_id').eq('enabled',true).limit(2)
 if(error||rows?.length!==1)return
 const {data,error:authError}=await db.auth.admin.getUserById(rows[0].user_id)
 if(authError||!data.user?.email_confirmed_at||data.user.email?.trim().toLowerCase()!==ownerEmail)return
 await syncCycleHistory(db,data.user.id,fetcher,token)
}

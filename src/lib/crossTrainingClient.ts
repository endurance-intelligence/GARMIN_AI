import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
export type CrossKind='strength'|'mobility'|'rowing'
export type GarminCrossActivity={
 activity_id:string;activity_name:string;start_time_local:string;sport_type:string;
 duration_s:number|null;distance_m:number|null;average_heart_rate:number|null;rpe_raw:number|null
}
export type CrossSession={
 id:string;session_date:string;kind:CrossKind;duration_minutes:number;
 rowing_distance_m:number|null;rpe:number|null;exercise_ids:string[];note:string;created_at:string
}
export type CrossResponse={
 manual:CrossSession[];garmin:GarminCrossActivity[];
 source:string;automaticTrainingChanges:boolean
}
async function fetchCross(body?:Record<string,unknown>):Promise<Record<string,unknown>>{
 if(!garminSupabase)throw Error('Garmin-Anmeldung fehlt.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte neu anmelden.')
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-cross-training',{
  method:body?'POST':'GET',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,
   apikey:garminPublishableKey,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 })
 const value=await response.json().catch(()=>({})) as Record<string,unknown>
 if(!response.ok){
  const error=new Error(typeof value.error==='string'?value.error:'Training: HTTP '+response.status)
  Object.assign(error,{duplicateGarmin:value.duplicateGarmin===true})
  throw error
 }
 return value
}
export async function loadCrossTraining():Promise<CrossResponse>{
 return await fetchCross() as CrossResponse
}
export async function saveCrossTraining(body:{
 clientRequestId:string;kind:CrossKind;date:string;durationMinutes:number;
 distanceMeters:number|null;rpe:number|null;exerciseIds:string[];
 note:string;confirmAdditional?:boolean
}):Promise<{saved:boolean}>{
 return await fetchCross({action:'log',...body}) as {saved:boolean}
}
export function berlinDate(){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=(k:string)=>p.find(x=>x.type===k)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
export function crossKind(type:string):CrossKind|'football'|null{
 if(type==='indoor_rowing')return 'rowing'
 if(type==='strength_training')return 'strength'
 if(type==='mobility')return 'mobility'
 if(type==='soccer')return 'football'
 return null
}
export function daysSince(day:string,today=berlinDate()){
 const a=Date.parse(day.slice(0,10)+'T12:00:00Z'),b=Date.parse(today+'T12:00:00Z')
 return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):9999
}

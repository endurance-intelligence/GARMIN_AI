/** Deduplicate concurrent authenticated Coach GET requests.
 * Single-flight only (NO completed-response cache). A participant's AbortSignal
 * stops its own wait without cancelling other mounted consumers.
 * Keyed by the session bearer token so accounts NEVER share responses.
 */
import {garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
const pending=new Map<string,Promise<Record<string,unknown>>>()
export function readCoachPrivate(endpoint:string,token:string,signal?:AbortSignal):Promise<Record<string,unknown>>{
 if(!token||!endpoint||!/^[a-z0-9/?=&_%.\-]+$/i.test(endpoint))return Promise.reject(Error('Ungültige Coach-Anfrage'))
 if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'))
 const key=token+'\n'+endpoint
 let request=pending.get(key)
 if(!request){
  request=(async()=>{
   const response=await fetch(garminSupabaseUrl+'/functions/v1/'+endpoint,{
    method:'GET',cache:'no-store',
    headers:{authorization:'Bearer '+token,apikey:garminPublishableKey}
   })
   if(!response.ok)throw Error('Coach-Daten aktuell nicht vollständig erreichbar ('+response.status+').')
   return await response.json() as Record<string,unknown>
  })()
  pending.set(key,request)
  const tracked=request
  void tracked.finally(()=>{if(pending.get(key)===tracked)pending.delete(key)}).catch(()=>{})
 }
 if(!signal)return request
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
  const aborted=()=>reject(new DOMException('Aborted','AbortError'))
  signal.addEventListener('abort',aborted,{once:true})
  request!.then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted))
 })
}

/** Official Personal API only, not Garmin cloud OAuth. Vault stores bearer
 * encrypted at rest; lease and cooldown are shared across all five workers.
 * Never bypass shared state or fall back to an independent token exchange.
 */
const BASE='https://personal.connectapi.garmin.com'
const TOKEN_PATH='/personalapitoken-service/personal-api/personal-api-key/token'
const tokenPattern=/^[A-Za-z0-9_+/.=-]{20,4096}$/
const UUID=/^[a-f0-9-]{36}$/i
const enc=new TextEncoder()
export class GarminPersonalDeferred extends Error {
 constructor(status){super('Garmin Personal API HTTP '+status);this.status=status}
}
export function retrySeconds(header,now=Date.now()){
 const raw=String(header??'').trim()
 let n=/^\d+$/.test(raw)?Number(raw):raw?Math.ceil((Date.parse(raw)-now)/1000):0
 if(!Number.isFinite(n)||n<0)n=0
 return Math.min(2147483647,Math.max(3600,Math.ceil(n)))
}
export function parsePersonalToken(body,now=Date.now()){
 let token=String(body).trim()
 if(token.startsWith('{')){
  try{const x=JSON.parse(token);token=String(x.access_token??x.accessToken??x.token??'')}catch{throw Error('garmin_token_format')}
 }else token=token.replace(/^"|"$/g,'')
 if(!tokenPattern.test(token))throw Error('garmin_token_format')
 const parts=token.split('.')
 // JWT expiry is used only to REDUCE the lifetime, never as authorization.
 // Opaque formats get a shorter conservative one-hour cache window.
 let until=now+3600000
 if(parts.length===3){
  try{
   const payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')))
   if(!Number.isFinite(payload.exp))throw Error('missing expiry')
   until=Math.min(now+23*3600000,payload.exp*1000-5*60000)
  }catch{throw Error('garmin_token_expiry')}
 }
 if(until<=now+60000)throw Error('garmin_token_expiry')
 return {token,expiresAt:new Date(until).toISOString()}
}
export async function createGarminPersonalClient(db,key,project,{fetcher=fetch,now=Date.now}={}){
 if(typeof key!=='string'||!key||typeof project!=='string'||!project)throw Error('garmin_configuration')
 const hash=await crypto.subtle.digest('SHA-256',enc.encode('garmin-personal-api:v1\0'+project+'\0'+key))
 const fingerprint=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')
 async function rpc(action,args={}){
  const {data,error}=await db.rpc('garmin_personal_api_control',{p_fingerprint:fingerprint,p_action:action,...args})
  if(error||!data||typeof data.status!=='string')throw Error('garmin_personal_state_unavailable')
  return data
 }
 const assertReady=s=>{if(s.status==='blocked')throw new GarminPersonalDeferred(429);if(s.status!=='ready')throw new GarminPersonalDeferred(503)}
 let generation=null,tokenPromise
 async function ready(){assertReady(await rpc('ready'))}
 async function block(response){await rpc('backoff',{p_retry_seconds:retrySeconds(response.headers.get('retry-after'),now())})}
 async function get(){
  const state=await rpc('acquire')
  if(state.status==='blocked')throw new GarminPersonalDeferred(429)
  if(state.status==='cached'&&typeof state.token==='string'&&tokenPattern.test(state.token)&&UUID.test(state.generation)){generation=state.generation;return state.token}
  if(state.status!=='refresh'||!UUID.test(state.lease))throw new GarminPersonalDeferred(503)
  const lease=state.lease
  try{
   const response=await fetcher(BASE+TOKEN_PATH,{method:'POST',headers:{Authorization:'ApiKey '+key},signal:AbortSignal.timeout(25000)})
   if(response.status===429)await block(response)
   if(!response.ok)throw new GarminPersonalDeferred(response.status)
   const {token,expiresAt}=parsePersonalToken(await response.text(),now())
   const saved=await rpc('store',{p_lease:lease,p_token:token,p_expires_at:expiresAt})
   if(saved.status!=='ok')throw new GarminPersonalDeferred(saved.status==='blocked'?429:503)
   generation=lease
   return token
  }catch(e){
   await rpc('fail',{p_lease:lease}).catch(()=>{})
   throw e
  }
 }
 const getToken=()=>tokenPromise??=get()
 async function guardedFetch(input,init){
  const url=new URL(typeof input==='string'?input:input.url??String(input))
  if(url.origin!==BASE||url.pathname===TOKEN_PATH||!generation)throw Error('garmin_personal_request_invalid')
  assertReady(await rpc('check',{p_lease:generation}))
  const response=await fetcher(input,init)
  if(response.status===429)await block(response)
  if(response.status===401)await rpc('invalidate',{p_lease:generation})
  return response
 }
 return {ready,getToken,fetch:guardedFetch}
}

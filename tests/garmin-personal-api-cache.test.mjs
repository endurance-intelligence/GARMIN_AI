import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createGarminPersonalClient,parsePersonalToken,retrySeconds} from '../supabase/functions/_shared/garmin-personal-client.mjs'
const now=Date.parse('2026-11-28T12:00:00Z')
const jwt=exp=>'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({exp:exp/1000})).toString('base64url')+'.synthetic-signature'
const token=jwt(now+24*3600000), key='synthetic-only-key'
const url='https://personal.connectapi.garmin.com/activity-service/activity/12345'
const lease='00000000-0000-4000-8000-000000000001'
function mock(){
 const state=new Map(),calls=[]
 const db={async rpc(name,p){
  assert.equal(name,'garmin_personal_api_control');const k=p.p_fingerprint
  const row=state.get(k)||{};state.set(k,row);const action=p.p_action
  const result=status=>({data:{status},error:null})
  if(action==='backoff'){row.blocked=true;row.retry=p.p_retry_seconds;return result('ok')}
  if(action==='invalidate'){if(row.gen===p.p_lease){row.token=null;row.blocked=true}return result('ok')}
  if(action==='fail'){row.lease=null;row.blocked=true;return result('ok')}
  if(row.blocked)return result('blocked')
  if(action==='ready')return result(row.lease?'busy':'ready')
  if(action==='acquire'){
   if(row.token)return {data:{status:'cached',token:row.token,generation:row.gen}}
   if(row.lease)return result('busy')
   row.lease=lease;return {data:{status:'refresh',lease}}
  }
  if(action==='store'){assert.equal(p.p_lease,row.lease);row.token=p.p_token;row.gen=row.lease;row.lease=null;return result('ok')}
  if(action==='check')return result(row.gen===p.p_lease?'ready':'stale')
  throw Error('unexpected')
 }}
 let status=200
 const fetcher=async (input)=>{calls.push(input);return String(input).endsWith('/token')?new Response(token):new Response('{}',{status,headers:{'Retry-After':'7200'}})}
 return {db,state,calls,fetcher,setStatus:s=>status=s}
}
test('JWT lifetime cap and key expiry, opaque fallback and retry-after',()=>{
 assert.equal(parsePersonalToken(token,now).expiresAt,new Date(now+23*3600000).toISOString())
 assert.equal(parsePersonalToken(jwt(now+30*60000),now).expiresAt,new Date(now+25*60000).toISOString())
 assert.throws(()=>parsePersonalToken(jwt(now+60000),now))
 assert.equal(parsePersonalToken('opaque-synthetic-token-123456789',now).expiresAt,new Date(now+3600000).toISOString())
 assert.equal(retrySeconds(null,now),3600)
 assert.equal(retrySeconds('7200',now),7200)
 assert.equal(retrySeconds(new Date(now+7200000).toUTCString(),now),7200)
})
test('idle is no remote call, cache reused across clients, rate limit blocks next client',async()=>{
 const m=mock(),opts={fetcher:m.fetcher,now:()=>now}
 const a=await createGarminPersonalClient(m.db,key,'project-A',opts)
 await a.ready();assert.equal(m.calls.length,0)
 assert.deepEqual(await Promise.all([a.getToken(),a.getToken()]),[token,token])
 const b=await createGarminPersonalClient(m.db,key,'project-A',opts)
 assert.equal(await b.getToken(),token);assert.equal(m.calls.length,1)
 m.setStatus(429);assert.equal((await a.fetch(url)).status,429)
 await assert.rejects(()=>b.fetch(url),{status:429})
 const c=await createGarminPersonalClient(m.db,key,'project-A',opts)
 await assert.rejects(()=>c.ready(),{status:429})
 assert.equal(m.calls.length,2);assert.equal([...m.state.values()][0].retry,7200)
 const rotated=await createGarminPersonalClient(m.db,key+'-new','project-A',opts)
 await rotated.getToken();assert.equal(m.calls.length,3)
 const second=await createGarminPersonalClient(m.db,key,'project-B',opts)
 await second.getToken();assert.equal(m.calls.length,4)
})
test('401 invalidates token generation; busy and database failure never issue a fallback token',async()=>{
 const m=mock(),opts={fetcher:m.fetcher,now:()=>now}
 const a=await createGarminPersonalClient(m.db,key,'project-A',opts)
 await a.getToken();m.setStatus(401);await a.fetch(url)
 const b=await createGarminPersonalClient(m.db,key,'project-A',opts)
 await assert.rejects(()=>b.getToken(),{status:429});assert.equal(m.calls.length,2)
 for(const db of [{rpc:async()=>({data:{status:'busy'}})},{rpc:async()=>({error:{code:'database'}})}]){
  const c=await createGarminPersonalClient(db,key,'project-A',opts)
  await assert.rejects(()=>c.getToken())
 }
 assert.equal(m.calls.length,2)
})
test('all five worker sources use the shared client and no raw token exchange',()=>{
 for(const name of ['sync-garmin','sync-garmin-health','backfill-garmin-history','backfill-garmin-details','sync-garmin-hr-profile']){
  const s=readFileSync(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8')
  assert.match(s,/createGarminPersonalClient\(admin,/)
  assert.match(s,/api\.ready\(\)/)
  assert.match(s,/api\.fetch/)
  assert.doesNotMatch(s,/personal-api-key\/token|await fetch\(/)
 }
 const sql=readFileSync(new URL('../supabase/migrations/20261128122713_garmin_personal_api_shared_cache.sql',import.meta.url),'utf8')
 assert.match(sql,/enable row level security/i);assert.match(sql,/security invoker/i)
 assert.match(sql,/vault\.create_secret/);assert.match(sql,/vault\.update_secret/)
 assert.match(sql,/for update/);assert.match(sql,/from public,anon,authenticated/i)
})

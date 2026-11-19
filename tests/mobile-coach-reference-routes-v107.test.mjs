import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {routeMetadata,sameEndpoints,elevationFingerprint,sameCourse,
  candidateIds,buildReferenceRoutes} from '../supabase/functions/read-garmin-reference-routes/model.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const location={startLatitude:51.0000,startLongitude:8.0000,
  endLatitude:51.0002,endLongitude:8.0002}
const activity=(id,date,opts={})=>({
  activity_id:id,activity_name:'PRIVATE STREET',start_time_local:date+' 09:00:00',
  sport_type:'running',distance_m:10000,duration_s:3600,average_heart_rate:135,
  rpe_raw:30,raw_activity:{...location,elevationGain:55,movingDuration:3500},
  ...opts,
})
const samples=(wave=1)=>Array.from({length:401},(_,i)=>{
  const p=i/400
  return {distance:10000*p,elevation:300+20*p+wave*24*Math.sin(Math.PI*p*2),
    hr:135,speed:2.9}
})
const detail=(id,points=samples())=>({activity_id:id,status:'complete',samples:points})
const rows=[
  activity('private-1','2026-01-02',{raw_activity:{...location,elevationGain:55,movingDuration:3600}}),
  activity('private-2','2026-02-02',{raw_activity:{...location,elevationGain:55,movingDuration:3500}}),
  activity('private-3','2026-06-02',{raw_activity:{...location,elevationGain:55,movingDuration:3400}}),
  activity('private-4','2026-09-02',{raw_activity:{...location,elevationGain:55,movingDuration:3300}}),
]
const details=rows.map(r=>detail(r.activity_id))
test('repeats require start/end, direction, distance and ascent',()=>{
  const a=routeMetadata(rows[0])
  assert.ok(a)
  assert.equal(sameEndpoints(a,routeMetadata(rows[1])),true)
  assert.equal(sameEndpoints(a,routeMetadata(activity('far','2026-02-01',{
    raw_activity:{...location,startLatitude:51.02,elevationGain:55,movingDuration:3500}}))),false)
  assert.equal(sameEndpoints(a,routeMetadata(activity('far','2026-02-01',{distance_m:10800}))),false)
  assert.equal(routeMetadata(activity('bike','2026-02-01',{sport_type:'cycling'})),null)
})
test('profile rejects incomplete altitude, invalid dates and reversed hills',()=>{
  assert.equal(elevationFingerprint(samples().slice(10,200),10000),null)
  const a={...routeMetadata(rows[0]),profile:elevationFingerprint(samples(1),10000)}
  const b={...routeMetadata(rows[1]),profile:elevationFingerprint(samples(-1),10000)}
  assert.equal(sameCourse(a,b),false)
  assert.equal(routeMetadata(activity('bad','not-a-date')),null)
  assert.equal(elevationFingerprint([{distance:0,elevation:10}],10000),null)
})
test('four comparable route runs yield median speed observation at similar HR and RPE',()=>{
  const data=buildReferenceRoutes(rows,details)
  assert.equal(data.readOnly,true)
  assert.equal(data.coverage.repeatedGroups,1)
  assert.equal(data.coverage.repeatedRuns,4)
  assert.equal(data.routes[0].runs,4)
  assert.equal(data.routes[0].comparison.status,'paired-medians')
  assert.equal(data.routes[0].comparison.olderRuns,2)
  assert.equal(data.routes[0].comparison.newerRuns,2)
  assert.ok(data.routes[0].comparison.deltaSecKm<0)
  const payload=JSON.stringify(data)
  for(const hidden of ['startLatitude','startLongitude','coords','profile',
    'private-1','PRIVATE STREET','activity_id','ownerId'])
    assert.ok(!payload.includes(hidden),hidden)
})
test('a single pair remains explicitly a single pair, not a measured fitness trend',()=>{
  const result=buildReferenceRoutes([rows[0],rows[3]],[details[0],details[3]])
  assert.equal(result.routes[0].comparison.status,'single-pair')
  assert.equal(result.routes[0].comparison.olderRuns,1)
})
test('same course cannot be compared with mismatched HR, hard RPE or prolonged pauses',()=>{
  const raised=[rows[0],activity('hi','2026-09-02',{average_heart_rate:151})]
  const hard=[rows[0],activity('hard','2026-09-02',{rpe_raw:80})]
  const paused=[rows[0],activity('paused','2026-09-02',{
    raw_activity:{...location,elevationGain:55,movingDuration:2200}})]
  for(const input of [raised,hard,paused]){
    const r=buildReferenceRoutes(input,input.map(x=>detail(x.activity_id)))
    assert.equal(r.routes.length,1)
    assert.equal(r.routes[0].comparison,null)
  }
})
test('no series, no route; distant endpoints must not be preloaded as FIT candidates',()=>{
  assert.deepEqual(candidateIds([rows[0],activity('elsewhere','2026-10-02',{
    raw_activity:{...location,startLatitude:52,elevationGain:55,movingDuration:3500}})]),[])
  assert.equal(buildReferenceRoutes(rows,[]).routes.length,0)
})
test('private endpoint, lazy UI and Coach integration are read-only',()=>{
  const api=read('supabase/functions/read-garmin-reference-routes/index.ts')
  const view=read('src/components/CoachReferenceRoutesCard.tsx')
  const parent=read('src/components/CoachLongTermCard.tsx')
  const config=read('supabase/config.toml')
  assert.match(api,/auth\.auth\.getUser\(bearer\[1\]\)/)
  assert.match(api,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
  assert.match(api,/req\.method!=='GET'/)
  assert.match(api,/candidateIds\(rows\)/)
  assert.match(api,/garmin_activity_details/)
  assert.doesNotMatch(api,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/)
  assert.match(view,/!active\|\|!opened\|\|attempted/)
  assert.match(view,/read-garmin-reference-routes/)
  assert.match(view,/Streckenkandidaten, nicht GPS-verifiziert/)
  assert.match(parent,/<CoachReferenceRoutesCard active=\{active&&expanded\}\/>/)
  assert.match(config,/\[functions\.read-garmin-reference-routes\]\s*\nverify_jwt = false/)
})

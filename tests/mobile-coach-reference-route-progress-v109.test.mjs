import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gpsRouteFingerprint} from '../supabase/functions/_shared/garmin-route-gps.mjs'
import {buildReferenceRoutes} from '../supabase/functions/read-garmin-reference-routes/model.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const points=(other=false)=>Array.from({length:1001},(_,i)=>{
  const t=i/1000
  return {distance:10000*t,
    positionLat:51+.008*Math.sin(2*Math.PI*t),
    positionLong:8+(other?-.012:.012)*(1-Math.cos(2*Math.PI*t))}
})
const route=(id,date)=>({activity_id:id,sport_type:'running',
  activity_name:'Secret running place',distance_m:10000,duration_s:3600,
  start_time_local:date+' 09:00:00',average_heart_rate:131,rpe_raw:30,
  raw_activity:{startLatitude:51,startLongitude:8,endLatitude:51,endLongitude:8,
    elevationGain:65,movingDuration:3550}})
const sample=(id)=>({activity_id:id,status:'complete',
  samples:Array.from({length:401},(_,i)=>({
    distance:25*i,elevation:200+18*Math.sin(2*Math.PI*i/400),hr:131,speed:2.8
  }))})
test('GPS-only matching wins despite a more recent no-GPS candidate',()=>{
 const rows=[route('legacy','2026-11-05'),route('north-new','2026-10-03'),
   route('south','2026-07-03'),route('north-old','2026-03-03')]
 const north=gpsRouteFingerprint(points()),south=gpsRouteFingerprint(points(true))
 const tracks=[
   {activity_id:'north-new',status:'complete',fingerprint:north},
   {activity_id:'south',status:'complete',fingerprint:south},
   {activity_id:'north-old',status:'complete',fingerprint:north}
 ]
 const result=buildReferenceRoutes(rows,rows.map(r=>sample(r.activity_id)),{tracks})
 assert.equal(result.coverage.gpsTracksAvailable,3)
 assert.equal(result.coverage.gpsVerifiedGroups,1)
 assert.equal(result.routes.length,2)
 assert.equal(result.routes[0].gpsStatus,'verified')
 assert.equal(result.routes[0].runs,2)
 assert.equal(result.routes[1].gpsStatus,'candidate')
 assert.equal(result.routes[1].runs,2)
 assert.equal(result.coverage.repeatedRuns,4)
 assert.equal(result.coverage.repeatedGroups,2)
 const json=JSON.stringify(result)
 for(const secret of ['legacy','north-new','south','north-old','Secret running place',
   'positionLat','fingerprint','gps:','coords'])assert.ok(!json.includes(secret),secret)
})
test('GPS progress is read as private bounded status-only data with reliable refresh',()=>{
 const api=read('supabase/functions/read-garmin-reference-routes/index.ts')
 const ui=read('src/components/CoachReferenceRoutesCard.tsx')
 assert.match(api,/\.select\('status,checked_at',\{count:'exact'\}\)\.limit\(500\)/)
 assert.match(api,/importCapped=importTotal>states.length/)
 assert.match(api,/percent:importCapped\|\|importTotal===0\?null/)
 assert.match(api,/importStatus,/)
 assert.doesNotMatch(api,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/)
 assert.match(ui,/Lade Streckenvergleich und Importfortschritt/)
 assert.match(ui,/<progress max=\{100\}/)
 assert.match(ui,/value=\{data.importStatus.percent\}/)
 assert.match(ui,/Fortschritt aktualisieren/)
 assert.match(ui,/setRefreshVersion\(v=>v\+1\)/)
 assert.match(ui,/\[active,opened,refreshVersion\]/)
 assert.doesNotMatch(ui,/setAttempted\(true\)/)
 assert.doesNotMatch(ui,/\[active,opened,attempted\]/)
})

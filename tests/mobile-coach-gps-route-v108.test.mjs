import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fitPosition,gpsMeters,gpsRouteFingerprint,gpsRouteMatch}
 from '../supabase/functions/_shared/garmin-route-gps.mjs'
import {buildReferenceRoutes} from '../supabase/functions/read-garmin-reference-routes/model.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const start={startLatitude:51,startLongitude:8,endLatitude:51,endLongitude:8}
const rows=[0,1,2].map((n)=>({
 activity_id:String(27000000000+n),sport_type:'running',
 activity_name:'Private exact route',distance_m:10000,duration_s:3600,
 average_heart_rate:129,rpe_raw:30,start_time_local:'2026-0'+(2+n*2)+'-10 08:00:00',
 raw_activity:{...start,elevationGain:80,movingDuration:3500}
}))
const detail=(row)=>({activity_id:row.activity_id,status:'complete',
 samples:Array.from({length:401},(_,i)=>({
  distance:25*i,elevation:150+25*Math.sin(2*Math.PI*i/400),hr:129,speed:2.85
 }))})
const records=(other=false,semicircle=false)=>Array.from({length:1001},(_,i)=>{
 const t=i/1000,lat=51+.008*Math.sin(2*Math.PI*t),
  lon=8+(other?-.012:.012)*(1-Math.cos(2*Math.PI*t))
 return {distance:10000*t,
  positionLat:semicircle?lat*2147483648/180:lat,
  positionLong:semicircle?lon*2147483648/180:lon}
})
test('FIT decoder accepts degrees and semicircles but rejects impossible coordinates',()=>{
 const p=fitPosition(records(false,true)[100])
 assert.ok(Math.abs(p[0]-51)<.01)
 assert.equal(fitPosition({positionLat:100,positionLong:200}),null)
 assert.equal(fitPosition({positionLat:0,positionLong:0}),null)
})
test('compact GPS evidence has 51 points, full-route coverage and direction',()=>{
 const route=gpsRouteFingerprint(records())
 assert.equal(route.points.length,51)
 assert.equal(route.validPoints,51)
 assert.equal(route.lengthM,10000)
 assert.ok(gpsMeters(route.points[0],route.points[50])<5)
 assert.equal(gpsRouteFingerprint(records().slice(400,700)),null)
 assert.equal(gpsRouteFingerprint(records().map(r=>({...r,positionLat:null}))),null)
})
test('different roads sharing start/end/distance/elevation are not identical',()=>{
 const a=gpsRouteFingerprint(records()),b=gpsRouteFingerprint(records(true))
 const verdict=gpsRouteMatch(a,b)
 assert.equal(verdict.match,false)
 assert.equal(verdict.reason,'geometry')
 const similar=gpsRouteFingerprint(records(false,true))
 assert.equal(gpsRouteMatch(a,similar).match,true)
})
test('route groups distinguish verified identical GPS tracks and unmatched routes',()=>{
 const gps=gpsRouteFingerprint(records()),other=gpsRouteFingerprint(records(true))
 const tracks=rows.map((r,i)=>({activity_id:r.activity_id,status:'complete',fingerprint:i===2?other:gps}))
 const model=buildReferenceRoutes(rows,rows.map(detail),{tracks})
 assert.equal(model.coverage.gpsTracksAvailable,3)
 assert.equal(model.coverage.gpsVerifiedGroups,1)
 assert.equal(model.routes.length,1)
 assert.equal(model.routes[0].runs,2)
 assert.equal(model.routes[0].gpsStatus,'verified')
 for(const forbidden of ['positionLat','positionLong','points','fingerprint',
  '27000000000','Private exact route']){
  assert.equal(JSON.stringify(model).includes(forbidden),false,forbidden)
 }
})
test('legacy route without GPS is never mislabeled GPS-verified',()=>{
 const gps=gpsRouteFingerprint(records())
 const tracks=[{activity_id:rows[0].activity_id,status:'complete',fingerprint:gps}]
 const model=buildReferenceRoutes(rows.slice(0,2),rows.slice(0,2).map(detail),{tracks})
 assert.equal(model.routes[0].gpsStatus,'candidate')
 assert.equal(model.coverage.gpsVerifiedGroups,0)
})
test('worker is read-only for preexisting FIT chunks, rate-limited, owner-only and private',()=>{
 const api=read('supabase/functions/read-garmin-reference-routes/index.ts')
 const worker=read('supabase/functions/backfill-garmin-details/index.ts')
 const decode=read('supabase/functions/_shared/garmin-fit.ts')
 const ui=read('src/components/CoachReferenceRoutesCard.tsx')
 const migration=read('supabase/migrations/20261119125000_garmin_private_gps_fingerprints_v108.sql')
 assert.match(decode,/gpsRouteFingerprint\(rawRecords\)/)
 assert.doesNotMatch(decode,/point\[['"]positionLat['"]\]/)
 assert.match(api,/from\('garmin_route_tracks'\)/)
 assert.match(api,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.match(worker,/if\(!fitClaim\)/)
 assert.match(worker,/garmin_route_claim/)
 assert.match(worker,/garmin_route_store/)
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/)
 assert.match(migration,/REVOKE ALL ON TABLE public\.garmin_route_tracks FROM PUBLIC, anon, authenticated/)
 assert.match(migration,/fit-download HTTP 429/)
 assert.match(migration,/interval '2 hours'/)
 assert.match(ui,/GPS-verifiziert/)
 assert.match(ui,/gpsStatus/)
})

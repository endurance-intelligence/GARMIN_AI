import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {longitudinalRouteTrend} from '../supabase/functions/read-garmin-reference-routes/longitudinal.mjs'
import {gpsRouteFingerprint} from '../supabase/functions/_shared/garmin-route-gps.mjs'
import {buildReferenceRoutes} from '../supabase/functions/read-garmin-reference-routes/model.mjs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const dates=['2025-01-08','2025-02-21','2025-04-03',
  '2025-06-13','2025-08-30','2025-11-14']
const runs=(paces=[400,396,391,387,379,370])=>dates.map((date,i)=>({
  id:'secret-'+i,date,pace:paces[i],hr:130+(i%2),
  rpe:3,hrCoverage:.98,gps:{points:[[51,8]]}
}))
test('requires verified GPS group, six independent easy runs across three months and 90 days',()=>{
 assert.equal(longitudinalRouteTrend(runs(),{verified:false}).status,'not-gps')
 assert.equal(longitudinalRouteTrend(runs().slice(0,5),{verified:true}).status,'insufficient')
 const short=runs().map((r,i)=>({...r,date:'2026-10-'+String(i+1).padStart(2,'0')}))
 const shortTrend=longitudinalRouteTrend(short,{verified:true})
 assert.equal(shortTrend.status,'insufficient')
 assert.equal(shortTrend.reason,'short-period')
 const duplicates=runs().map(r=>({...r,date:'2025-01-08'}))
 const dupTrend=longitudinalRouteTrend(duplicates,{verified:true})
 assert.equal(dupTrend.reason,'few-comparable-runs')
})
test('repeated GPS-confirmed easy runs show a cautious observation, not a fitness claim',()=>{
 const result=longitudinalRouteTrend(runs(),{verified:true})
 assert.equal(result.status,'ready')
 assert.equal(result.direction,'faster')
 assert.equal(result.matchedRuns,6)
 assert.ok(result.spanDays>250)
 assert.ok(result.deltaSecKm<=-20)
 assert.ok(result.medianSlopeSecPer90d<0)
 assert.equal(result.series.length,6)
 for(const forbidden of ['secret-','gps','coords','points','positionLat','activity_id']){
   assert.equal(JSON.stringify(result).includes(forbidden),false,forbidden)
 }
})
test('worsening and stable pace are not mislabeled as improved',()=>{
 const down=longitudinalRouteTrend(runs([360,365,370,375,385,395]),{verified:true})
 assert.equal(down.status,'ready')
 assert.equal(down.direction,'slower')
 const flat=longitudinalRouteTrend(runs([382,378,382,381,379,380]),{verified:true})
 assert.equal(flat.status,'ready')
 assert.equal(flat.direction,'inconclusive')
})
test('mismatched HR, effort, missing RPE and low HR coverage never form long-term trend',()=>{
 assert.equal(longitudinalRouteTrend(runs().map((r,i)=>({
   ...r,hr:i<2?127:i>3?133:130
 })),{verified:true}).reason,'load-drift')
 assert.equal(longitudinalRouteTrend(runs().map((r,i)=>({
   ...r,hr:i<3?115:142
 })),{verified:true}).reason,'few-comparable-runs')
 assert.equal(longitudinalRouteTrend(runs().map((r,i)=>({
   ...r,rpe:i<3?2:5
 })),{verified:true}).reason,'few-comparable-runs')
 assert.equal(longitudinalRouteTrend(runs().map((r,i)=>({
   ...r,rpe:i<3?null:3
 })),{verified:true}).reason,'few-easy-runs')
 assert.equal(longitudinalRouteTrend(runs().map((r,i)=>({
   ...r,hrCoverage:i<2?.3:.95
 })),{verified:true}).reason,'few-easy-runs')
})
test('plot points bounded to 24 while trend considers all independent observations',()=>{
 const long=Array.from({length:30},(_,i)=>({
   id:'private-id-'+i,
   date:new Date(Date.UTC(2025,0,3+i*18)).toISOString().slice(0,10),
   pace:400-i*1.5,hr:130,rpe:3,hrCoverage:1
 }))
 const trend=longitudinalRouteTrend(long,{verified:true})
 assert.equal(trend.status,'ready')
 assert.equal(trend.matchedRuns,30)
 assert.equal(trend.series.length,24)
 assert.equal(trend.series[0].date,long[0].date)
 assert.equal(trend.series.at(-1).date,long.at(-1).date)
})
test('actual route API response carries GPS-only trend but never raw identifiers or positions',()=>{
 const raw=Array.from({length:501},(_,i)=>{
   const t=i/500
   return {distance:10000*t,
     positionLat:51+.006*Math.sin(2*Math.PI*t),
     positionLong:8+.006*(1-Math.cos(2*Math.PI*t))}
 })
 const gps=gpsRouteFingerprint(raw)
 const activities=runs().map((r,i)=>({
   activity_id:'secret-'+i,sport_type:'running',start_time_local:r.date+' 08:00:00',
   distance_m:10000,duration_s:r.pace*10+20,average_heart_rate:r.hr,
   rpe_raw:30,raw_activity:{startLatitude:51,startLongitude:8,
     endLatitude:51,endLongitude:8,elevationGain:90,movingDuration:r.pace*10}
 }))
 const samples=activities.map(a=>({activity_id:a.activity_id,status:'complete',
   samples:Array.from({length:401},(_,i)=>({
     distance:10000*i/400,elevation:150+15*Math.sin(2*Math.PI*i/400),hr:130
   }))}))
 const tracks=activities.map(a=>({activity_id:a.activity_id,status:'complete',fingerprint:gps}))
 const response=buildReferenceRoutes(activities,samples,{tracks})
 assert.equal(response.routes[0].gpsStatus,'verified')
 assert.equal(response.routes[0].longTerm.status,'ready')
 assert.equal(response.routes[0].longTerm.matchedRuns,6)
 assert.equal(response.routes[0].comparison.status,'paired-medians')
 for(const forbidden of ['secret-','positionLat','fingerprint','gps:','activity_id']){
   assert.equal(JSON.stringify(response).includes(forbidden),false,forbidden)
 }
})
test('private API, visualization and mobile chart remain read-only with explicit caveats',()=>{
 const index=read('supabase/functions/read-garmin-reference-routes/index.ts')
 const model=read('supabase/functions/read-garmin-reference-routes/model.mjs')
 const view=read('src/components/CoachRouteTrend.tsx')
 const card=read('src/components/CoachReferenceRoutesCard.tsx')
 const style=read('src/styles/coach-reference-routes.css')
 assert.match(model,/longitudinalRouteTrend\(group,\{verified\}\)/)
 assert.match(index,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.doesNotMatch(index,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/)
 assert.match(view,/Wetter, Untergrund, Ermüdung und Messfehler/)
 assert.match(view,/Kein automatischer Eingriff/)
 assert.match(view,/viewBox="0 0 320 88"/)
 assert.match(card,/<CoachRouteTrend trend=\{route.longTerm\}\/>/)
 assert.match(style,/@media\(max-width:480px\)/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseGpxTrack,routeSvg,windSegments,bearing} from '../src/lib/gpxRaceRoute.mjs'
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('GPX yields actual geometry, elevation and route scrub track (no invented shade)',()=>{
 const xml='<gpx version="1.1"><trk><trkseg>'+
  '<trkpt lat="50.000" lon="9.000"><ele>250</ele></trkpt>'+
  '<trkpt lat="50.009" lon="9.000"><ele>258</ele></trkpt>'+
  '<trkpt lat="50.018" lon="9.000"><ele>251</ele></trkpt>'+
  '</trkseg></trk></gpx>'
 const parsed=parseGpxTrack(xml)
 assert.equal(parsed.originalPoints,3)
 assert.equal(parsed.points.length,3)
 assert.ok(parsed.distanceM>1900&&parsed.distanceM<2100)
 assert.equal(parsed.ascentM,8)
 assert.equal(parsed.descentM,7)
 const drawing=routeSvg(parsed.points)
 assert.equal(drawing.positions.length,3)
 assert.ok(drawing.polyline.includes(','))
 assert.ok(Math.abs(drawing.totalM-parsed.distanceM)<1)
})
test('northbound course vs north wind shows headwind directional component, not shelter claim',()=>{
 const p=[[50,9],[50.009,9],[50.018,9],[50.027,9]]
 assert.ok(bearing(p[0],p[1])<1)
 const risk=windSegments(p,0,22)
 assert.ok(risk.length>=1)
 assert.ok(risk[0].headwindKmh>=21)
 assert.deepEqual(windSegments(p,180,22),[])
 assert.deepEqual(windSegments(p,0,0),[])
 const ui=read('src/components/RaceRouteViewer.tsx')
 assert.match(ui,/keine Aussage über Abschirmung durch Bäume oder Gebäude/)
 assert.match(ui,/Streckenschatten/)
 assert.match(ui,/Originalkarte öffnen/)
})
test('malformed, oversized and XXE GPX cannot be ingested',()=>{
 assert.throws(()=>parseGpxTrack('<xml/>'))
 assert.throws(()=>parseGpxTrack('<gpx><!DOCTYPE thing></gpx>'))
 assert.throws(()=>parseGpxTrack('<gpx><trkpt lat="1000" lon="9"></trkpt></gpx>'))
})
test('exactly one main Coach goal, other race goals are separately stored and can be promoted atomically',()=>{
 const sql=read('supabase/migrations/20261111161000_coach_secondary_goals_v0935.sql')
 const api=read('supabase/functions/garmin-race-goals/index.ts')
 const ui=read('src/components/RaceGoalsPanel.tsx')
 assert.match(sql,/garmin_coach_secondary_goals/)
 assert.match(sql,/garmin_promote_race_goal/)
 assert.match(sql,/security invoker/)
 assert.match(sql,/for update/)
 assert.match(sql,/on conflict\(user_id\) do update/)
 assert.match(sql,/revoke all .*anon,authenticated/)
 assert.match(sql,/enable row level security/)
 assert.match(api,/user\.email_confirmed_at/)
 assert.match(api,/\.rpc\('garmin_promote_race_goal'/)
 assert.match(api,/input\.confirm!==true/)
 assert.match(ui,/Zum Hauptziel machen/)
 assert.match(ui,/Weiteres Ziel/)
 assert.match(ui,/Als Hauptziel bestätigen/)
})
test('track editions keep previous geometry when route reused; owner verifies event link',()=>{
 const api=read('supabase/functions/garmin-race-route/index.ts')
 const sql=read('supabase/migrations/20261111165000_race_tracks_v0935.sql')
 assert.match(sql,/unique\(user_id,race_date,route_url\)/)
 assert.match(sql,/enable row level security/)
 assert.match(api,/\.from\('garmin_race_event_research'\)/)
 assert.match(api,/\.eq\('user_id',user\.id\)\.eq\('route_url',routeUrl\)/)
 assert.match(api,/input\.confirm!==true/)
 assert.match(api,/input\.routeUrl!==routeUrl/)
 assert.match(api,/garminChanged:false,intervalsChanged:false/)
 assert.match(api,/coordinates.*length>1800/)
})
test('Race Prep uses compact goal-bound weather, not a large independent manual forecast',()=>{
 const race=read('src/pages/RacePage.tsx')
 const weather=read('src/components/RaceForecastCompact.tsx')
 assert.match(race,/<RaceGoalsPanel active=\{active\}/)
 assert.match(race,/<RaceForecastCompact active=\{active\}/)
 assert.match(race,/<RaceRouteViewer active=\{active\}/)
 assert.doesNotMatch(race,/<WeatherPanel active=/)
 assert.match(weather,/raceSegments\(report,race\.race_date,start,duration\)/)
 assert.match(weather,/forecast.*getWeather|await getWeather\(exact\)/)
 assert.match(weather,/Stadtprognose/)
 assert.match(weather,/keine erfundenen Werte/)
 assert.match(weather,/<details className="rfc-details">/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {screenPaceOutliers,longitudinalRouteTrend}
 from '../supabase/functions/read-garmin-reference-routes/longitudinal.mjs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const valid=(count=8)=>Array.from({length:count},(_,i)=>({
  id:'PRIVATE-GARMIN-ID-'+i,
  date:new Date(Date.UTC(2025,0,12+i*44)).toISOString().slice(0,10),
  pace:400-i*4,hr:130,rpe:3,hrCoverage:.97
}))
test('single implausible fastest pace does not manufacture a stronger trend',()=>{
  const runs=valid()
  runs[7].pace=215
  const screened=screenPaceOutliers(runs)
  assert.equal(screened.excluded,1)
  assert.equal(screened.accepted.length,7)
  const trend=longitudinalRouteTrend(runs,{verified:true})
  assert.equal(trend.status,'ready')
  assert.equal(trend.matchedRuns,7)
  assert.equal(trend.excludedOutliers,1)
  assert.equal(trend.direction,'faster')
  assert.ok(trend.newerPace>365)
  assert.ok(trend.typicalScatterSecKm<5)
  assert.ok(trend.series.every(s=>s.paceSecKm>300))
  assert.ok(!JSON.stringify(trend).includes('PRIVATE-GARMIN-ID-'))
})
test('a 6-run group with a severe anomaly is not promoted to a trend',()=>{
  const runs=valid(6)
  runs[5].pace=205
  const trend=longitudinalRouteTrend(runs,{verified:true})
  assert.equal(trend.status,'insufficient')
  assert.equal(trend.reason,'pace-outliers')
  assert.equal(trend.excludedOutliers,1)
  assert.equal(trend.matchedRuns,5)
})
test('day-to-day spread suppresses overconfident better or worse labels',()=>{
  const runs=valid()
  const paces=[401,365,414,374,395,377,356,375]
  for(let i=0;i<runs.length;i++)runs[i].pace=paces[i]
  const trend=longitudinalRouteTrend(runs,{verified:true})
  assert.equal(trend.status,'ready')
  assert.equal(trend.direction,'inconclusive')
  assert.ok(trend.typicalScatterSecKm>Math.abs(trend.deltaSecKm)/2)
})
test('route with no GPS evidence still cannot be analyzed',()=>{
  const trend=longitudinalRouteTrend(valid(),{verified:false})
  assert.equal(trend.status,'not-gps')
})
test('no new position, activity ID or FIT detail data enters the browser',()=>{
  const model=read('supabase/functions/read-garmin-reference-routes/longitudinal.mjs')
  const api=read('supabase/functions/read-garmin-reference-routes/index.ts')
  const ui=read('src/components/CoachRouteTrend.tsx')
  assert.match(model,/screenPaceOutliers\(independent\)/)
  assert.match(model,/wellSeparated/)
  assert.match(model,/Math\.max\(22,3\.5\*1\.4826\*mad\)/)
  assert.match(ui,/auffällige Läufe ausgeschlossen/)
  assert.match(ui,/typische Abweichung/)
  assert.match(ui,/Kein automatischer Eingriff/)
  assert.match(api,/req\.method!=='GET'/)
  assert.doesNotMatch(api,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {healthOverview,weightHistory,shiftDay} from '../src/lib/healthOverview.mjs'
const today='2026-11-28'
test('health dashboard uses actual dated observations, rejects future and duplicate days',()=>{
 const rows=Array.from({length:7},(_,i)=>({metric_date:shiftDay(today,-i),hrv_ms:40+i,stress_avg:20+i,body_battery_max:80+i,resting_heart_rate:50,sleep_seconds:27000}))
 rows.push({metric_date:shiftDay(today,1),hrv_ms:100},{metric_date:today,hrv_ms:200})
 const result=healthOverview(rows,today)
 const h=result.find(r=>r.key==='hrv_ms'),s=result.find(r=>r.key==='stress_avg')
 assert.equal(h.latest.value,40);assert.equal(h.count,7);assert.equal(h.median,43)
 assert.equal(s.latest.date,shiftDay(today,-1));assert.equal(s.count,6);assert.equal(s.median,23.5)
})
test('missing days are not invented; sparse data has no median',()=>{
 const h=healthOverview([{metric_date:today,hrv_ms:42},{metric_date:shiftDay(today,-5),hrv_ms:45}],today)[0]
 assert.equal(h.points.length,2);assert.equal(h.median,null)
 assert.deepEqual(weightHistory([{weigh_date:today,weight_kg:77.8},{weigh_date:shiftDay(today,-28),weight_kg:78},{weigh_date:shiftDay(today,-1),weight_kg:null}],today),[{date:today,value:77.8}])
})
test('health workspace reuses authenticated reads and canonical weight entry, no changes to six mobile destinations',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/App.tsx'),/<HealthPage active=/)
 assert.match(read('src/pages/MorePage.tsx'),/onGo\('health'\)/)
 const page=read('src/pages/HealthPage.tsx')
 assert.match(page,/read-garmin-health/)
 assert.match(page,/<SyncCenter active=\{active\} mode="weight" expandedHealth/)
 assert.match(page,/bestätigte Körpergröße/)
 assert.doesNotMatch(page,/method:'POST'/)
})

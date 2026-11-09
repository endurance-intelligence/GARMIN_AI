import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recoveryTrend} from '../src/lib/recoveryTrend.ts'
import {interpretRecovery,recoveryNarrative} from '../src/lib/recoveryComparison.ts'
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8')
const base=Array.from({length:14},(_,i)=>({
 metric_date:new Date(Date.parse('2026-10-26T12:00:00Z')+i*86400000).toISOString().slice(0,10),
 hrv_ms:54,resting_heart_rate:44,sleep_seconds:26340
}))
const recent=[
 {metric_date:'2026-11-03',hrv_ms:65,resting_heart_rate:40,sleep_seconds:24360},
 {metric_date:'2026-11-04',hrv_ms:49,resting_heart_rate:45,sleep_seconds:25080},
 {metric_date:'2026-11-05',hrv_ms:42,resting_heart_rate:44,sleep_seconds:24060},
 {metric_date:'2026-11-06',hrv_ms:69,resting_heart_rate:43,sleep_seconds:32880},
 {metric_date:'2026-11-07',hrv_ms:null,resting_heart_rate:46,sleep_seconds:null},
 {metric_date:'2026-11-08',hrv_ms:41,resting_heart_rate:44,sleep_seconds:24900},
 {metric_date:'2026-11-09',hrv_ms:49,resting_heart_rate:42,sleep_seconds:29880}
]
test('sparkline always represents seven dated slots, without bridging missing Garmin data',()=>{
 const trend=recoveryTrend(recent,'hrv_ms','2026-11-09',54)
 assert.equal(trend.points.length,7)
 assert.equal(trend.validCount,6)
 assert.equal(trend.points[4].day,'2026-11-07')
 assert.equal(trend.points[4].y,null)
 assert.equal(trend.segments.length,2)
 assert.ok(trend.referenceY!==null)
})
test('no baseline guide is drawn when personal comparison is unavailable',()=>{
 const trend=recoveryTrend(recent,'hrv_ms','2026-11-09',null)
 assert.equal(trend.referenceY,null)
 assert.equal(trend.validCount,6)
})
test('invalid and short sleep values are omitted rather than fabricating a trend',()=>{
 const abnormal=[...recent,{metric_date:'2026-11-09',hrv_ms:null,resting_heart_rate:null,sleep_seconds:1200}]
 const trend=recoveryTrend(abnormal,'sleep_seconds','2026-11-09',26340)
 assert.equal(trend.points.at(-1)?.value,null)
 assert.equal(trend.points.at(-1)?.y,null)
 assert.equal(trend.validCount,5)
})
test('empty measured history draws no phantom lines',()=>{
 const trend=recoveryTrend([],'resting_heart_rate','2026-11-09',null)
 assert.equal(trend.segments.length,0)
 assert.equal(trend.validCount,0)
 assert.ok(trend.points.every(p=>p.y===null))
})
test('summary uses measured prior median and never claims readiness',()=>{
 const comparison=interpretRecovery([...base.slice(0,8),...recent],'2026-11-09')
 const txt=recoveryNarrative(comparison)
 assert.match(txt,/Schlaf als zuletzt/)
 assert.match(txt,/HRV unter dem jüngsten Median/)
 assert.match(txt,/Ruhepuls unter dem jüngsten Median/)
 assert.doesNotMatch(txt,/erholt|trainingsbereit|Score/i)
})
test('Coach shows colored SVG mini-trends rather than a data table',()=>{
 const glance=read('src/components/CoachGlance.tsx')
 const chart=read('src/components/RecoverySparkline.tsx')
 const css=read('src/styles/coach-glance.css')
 assert.match(glance,/<RecoverySparkline/)
 assert.match(glance,/recoveryNarrative\(comparison\)/)
 assert.match(glance,/<div className="co-trend-grid"/)
 assert.match(chart,/<svg viewBox="0 0 180 66"/)
 assert.match(chart,/trend\.referenceY!==null/)
 assert.match(chart,/trend\.segments\.map/)
 assert.match(css,/\.co-trend-sleep\{/)
 assert.match(css,/\.co-trend-hrv\{/)
 assert.match(css,/\.co-trend-pulse\{/)
 assert.match(css,/@media\(max-width:760px\)/)
 assert.doesNotMatch(glance,/<table>|Letzte Messungen/)
})

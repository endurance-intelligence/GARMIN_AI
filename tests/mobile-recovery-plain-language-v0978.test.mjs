import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recoveryDashboardMeaning,recoveryMetricMeaning} from '../src/lib/recoveryMeaning.mjs'
import {interpretRecovery,recoveryNarrative} from '../src/lib/recoveryComparison.ts'
import {recoveryWeekTrend} from '../src/lib/recoveryWeekTrend.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-17'
const from=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const baseline=Array.from({length:14},(_,i)=>({
 metric_date:from(today,i-14),sleep_seconds:7*3600+46*60,hrv_ms:49,resting_heart_rate:44
}))
test('exact measured 65-minute sleep drop gives understandable and careful advice',()=>{
 const report=interpretRecovery([...baseline,{
  metric_date:today,sleep_seconds:6*3600+41*60,hrv_ms:54,resting_heart_rate:43
 }],today)
 assert.ok(report)
 assert.equal(report.metrics[0].difference,-65*60)
 assert.equal(report.metrics[1].difference,5)
 assert.equal(report.metrics[2].difference,-1)
 assert.match(recoveryNarrative(report),/65 Min\. weniger Schlaf als sonst/)
 assert.match(recoveryMetricMeaning(report.metrics[0]),/65 Min\. weniger Schlaf als sonst/)
 assert.match(recoveryMetricMeaning(report.metrics[1]),/HRV liegt ungefähr im gewohnten Bereich/)
 assert.match(recoveryMetricMeaning(report.metrics[2]),/Ruhepuls ist ungefähr so wie sonst/)
 assert.match(recoveryDashboardMeaning(report),/weniger geschlafen als sonst/)
 assert.doesNotMatch(recoveryDashboardMeaning(report),/Median|Referenz|Baseline|Trainingsfreigabe/)
})
test('baseline math remains the same fourteen-day median with at least seven values',()=>{
 const report=interpretRecovery([...baseline,{metric_date:today,sleep_seconds:24060,hrv_ms:54,resting_heart_rate:43}],today)
 assert.ok(report)
 assert.equal(report.metrics[0].median,27960)
 assert.equal(report.metrics[1].median,49)
 assert.equal(report.metrics[2].median,44)
 assert.equal(report.metrics[0].sampleCount,14)
 assert.equal(report.referenceStart,'2026-11-03')
 assert.equal(report.referenceEnd,'2026-11-16')
 const short=interpretRecovery([...baseline.slice(0,6),{metric_date:today,sleep_seconds:24060,hrv_ms:54,resting_heart_rate:43}],today)
 assert.equal(short?.metrics[0].median,null)
 assert.match(recoveryDashboardMeaning(short),/noch ein paar Tage/)
})
test('the seven-day trend still uses measured weeks, but speaks plain German',()=>{
 const metrics=baseline.map((x,i)=>({...x,
   hrv_ms:i<7?42:49,resting_heart_rate:i<7?46:43,
   sleep_seconds:i<7?7*3600:7*3600+40*60
 }))
 const t=recoveryWeekTrend([...metrics,{metric_date:today,hrv_ms:54,resting_heart_rate:43,sleep_seconds:24060}],today)
 assert.ok(t)
 assert.match(t.summary,/HRV/)
 assert.match(t.summary,/letzte Woche/)
 assert.doesNotMatch(t.summary,/Median|Baseline|Referenz/)
 assert.equal(t.hrv.sampleCurrent,7)
 assert.equal(t.hrv.samplePrevious,7)
})
test('morning UI is readable immediately; technical methods stay optional and explained',()=>{
 const panel=read('src/components/CoachGlance.tsx')
 const card=read('src/lib/recoveryMeaning.mjs')
 const trends=read('src/lib/recoveryWeekTrend.mjs')
 const graph=read('src/components/RecoverySparkline.tsx')
 assert.match(panel,/Was deine Werte sagen/)
 assert.match(panel,/Linie: letzte 7 Tage · gestrichelt: dein üblicher Wert/)
 assert.match(panel,/Mehr wissen\? Die Werte einfach erklärt/)
 assert.match(panel,/Fachbegriff: Median/)
 assert.match(panel,/mindestens sieben Tage/)
 assert.doesNotMatch(panel,/Heute separat:|Referenz \{shortDay|Linie: 7 Tage · gestrichelt: jüngster Median/)
 assert.doesNotMatch(card,/jüngsten Median|jüngste Referenz/)
 assert.doesNotMatch(trends,/HRV-Median|Ruhepuls-Median|Schlaf-Median/)
 assert.match(graph,/typischen Vergleichswert/)
})

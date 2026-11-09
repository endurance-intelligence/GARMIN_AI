import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {interpretRecovery,recoveryMedian,formatSleep,differenceLabel,calendarDayOffset}
 from '../src/lib/recoveryComparison.ts'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const anchor='2026-11-09'
const last={metric_date:anchor,sleep_seconds:29880,hrv_ms:49,resting_heart_rate:42}
const days=Array.from({length:14},(_,i)=>({
 metric_date:calendarDayOffset(anchor,-14+i),
 sleep_seconds:26340,hrv_ms:54,resting_heart_rate:44
}))
test('current Garmin values are compared only to prior 14-day observations',()=>{
 const report=interpretRecovery([...days,last],anchor)
 assert.ok(report)
 assert.equal(report.referenceStart,'2026-10-26')
 assert.equal(report.referenceEnd,'2026-11-08')
 const [sleep,hrv,rhr]=report.metrics
 assert.equal(sleep.median,26340)
 assert.equal(hrv.median,54)
 assert.equal(rhr.median,44)
 assert.equal(sleep.sampleCount,14)
 assert.equal(sleep.difference,3540)
 assert.equal(hrv.difference,-5)
 assert.equal(rhr.difference,-2)
 assert.equal(formatSleep(sleep.latest),'8:18 h')
 assert.equal(differenceLabel(sleep),'+59 Min.')
 assert.equal(differenceLabel(hrv),'-5 ms')
 assert.equal(differenceLabel(rhr),'-2 bpm')
 assert.match(report.headline,/Schlafdauer über dem jüngsten Median/)
})
test('median handles even and odd sample sizes and never uses the latest day',()=>{
 assert.equal(recoveryMedian([46,55,49]),49)
 assert.equal(recoveryMedian([40,50,60,70]),55)
 assert.equal(recoveryMedian([]),null)
 const inflated={...last,hrv_ms:200}
 assert.equal(interpretRecovery([...days,inflated],anchor)?.metrics[1].median,54)
})
test('less than seven reference observations gives no invented comparison',()=>{
 const report=interpretRecovery([last,...days.slice(0,6)],anchor)
 assert.ok(report)
 assert.equal(report.metrics[0].sampleCount,6)
 assert.equal(report.metrics[0].median,null)
 assert.equal(report.metrics[0].difference,null)
 assert.equal(differenceLabel(report.metrics[0]),'Noch kein Vergleich')
 assert.match(report.headline,/Vergleich fehlen noch Messwerte/)
})
test('incomplete sleep records and invalid days never become baseline data',()=>{
 const modified=days.map((d,i)=>i<5?{...d,sleep_seconds:1200}:d)
 const report=interpretRecovery([last,...modified,{...days[0],metric_date:'2026-02-30'}],anchor)
 assert.ok(report)
 assert.equal(report.metrics[0].sampleCount,9)
 assert.equal(report.metrics[0].median,26340)
 assert.equal(formatSleep(null),'–')
 assert.equal(calendarDayOffset('2026-02-30',1),'')
})
test('compact Coach health context is real, neutral and explicitly not a readiness score',()=>{
 const glance=read('src/components/CoachGlance.tsx')
 const css=read('src/styles/coach-glance.css')
 const coach=read('src/pages/CoachPage.tsx')
 const model=read('src/lib/recoveryComparison.ts')
 assert.match(glance,/interpretRecovery\(view\?\.healthHistory\|\|\[\],health.metric_date\)/)
 assert.match(glance,/Die gestrichelte Linie zeigt den Median der 14 Tage/)
 assert.match(glance,/keine Trainingsfreigabe/)
 assert.match(glance,/Was bedeuten diese Werte\?/)
 assert.match(glance,/Schlaf & Erholung/)
 assert.match(css,/\.co-trend-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
 assert.match(css,/\.co-trend-tile\{[^}]*border:1px/)
 assert.doesNotMatch(glance,/<table>/)
 assert.doesNotMatch(coach,/<LiveRecovery active=/)
 assert.doesNotMatch(coach,/Erholung & Verläufe im Detail/)
 assert.doesNotMatch(model,/readinessScore|trainingApproved|isRecovered|readyToTrain/)
})
test('owner auth, weather, race and weight quick action remain intact',()=>{
 const coach=read('src/pages/CoachPage.tsx')
 const glance=read('src/components/CoachGlance.tsx')
 assert.match(read('src/App.tsx'),/<OnlineAccessGate>/)
 assert.match(coach,/<WeatherPanel active=\{active\} mode="training" compact\/>/)
 assert.match(coach,/mode="weight" inlineWheel onSaved=/)
 assert.match(glance,/get\('read-garmin-health',token\)/)
 assert.match(glance,/authorization:'Bearer '\+token/)
})

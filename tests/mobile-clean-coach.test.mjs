import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Coach uses a small header and glance, no default oversized cards',()=>{
 const c=read('src/pages/CoachPage.tsx')
 assert.match(c,/Dein Tag im Blick/)
 assert.match(c,/<CoachGlance active=\{active\}/)
 assert.match(c,/<CoachTodayWeather active=\{active\}\/>/)
 assert.match(read('src/components/CoachGlance.tsx'),/<details className="co-recovery-details">/)
 assert.doesNotMatch(c,/<details className="co-extra co-demo"/)
 assert.match(c,/<CoachSevenDay active=\{active\}/)
 assert.doesNotMatch(c,/<LiveRecovery active=/)
 assert.ok(c.indexOf('<CoachGlance')<c.indexOf('<CoachSevenDay'))
 assert.ok(c.indexOf('<CoachSevenDay')<c.indexOf('<CoachEvidenceSummary'))
})

test('weight is one quick sheet with direct swipe wheels and verified save',()=>{
 const c=read('src/pages/CoachPage.tsx')
 const picker=read('src/components/WeightWheelPicker.tsx')
 const sync=read('src/components/SyncCenter.tsx')
 assert.match(c,/className="co-weight-action"/)
 assert.match(c,/aria-haspopup="dialog"/)
 assert.match(c,/role="dialog" aria-modal="true"/)
 assert.match(c,/mode="weight" inlineWheel onSaved=/)
 assert.match(picker,/if\(inline\)return <div className="weight-inline-control"/)
 assert.match(picker,/<WheelColumn label="Kilogramm"/)
 assert.match(picker,/<WheelColumn label="Zehntel"/)
 assert.match(sync,/session,'POST',\{date,kg\}/)
 assert.match(sync,/onSaved\?\.\(kg\)/)
 assert.match(sync,/Garmin-Übertragung folgt nach Freigabe/)
})

test('old simulated Coach prototype is retired and replaced by live decision panels',()=>{
 const c=read('src/pages/CoachPage.tsx')
 assert.doesNotMatch(c,/Coach-Prototyp ansehen · Demo/)
 assert.doesNotMatch(c,/DEMO · keine Änderung am Trainingsplan/)
 assert.match(read('src/components/CoachSevenDay.tsx'),/<CoachDecisionLive/)
 assert.match(read('src/components/CoachDecisionLive.tsx'),/ECHTE DATEN/)
})

test('overview is backed by existing authenticated Garmin services',()=>{
 const c=read('src/components/CoachGlance.tsx')
 for(const endpoint of ['garmin-weekly-options','garmin-training-plan','read-garmin-health']){
  assert.ok(c.includes(endpoint),endpoint)
 }
 assert.match(c,/garminSupabase.auth.getSession\(\)/)
 assert.match(c,/authorization:'Bearer '\+token/)
 assert.match(c,/cache:'no-store'/)
 assert.match(c,/Heute trainingsfrei · bewusst ausgelassen/)
 assert.doesNotMatch(c,/Heute noch offen/)
 assert.match(c,/Trainingskalender nicht vollständig erreichbar/)
 assert.match(c,/get\('garmin-coach-context',token\)/)
 assert.doesNotMatch(c,/service_role|SUPABASE_SECRET|scheduleWorkout\(/)
})

test('glance CSS stays responsive and sheet has iOS safe-area bottom padding',()=>{
 const css=read('src/styles/coach-glance.css')
 assert.match(css,/\.co-trend-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
 assert.match(css,/@media\(max-width:760px\)/)
 assert.match(css,/safe-area-inset-bottom/)
 assert.match(css,/\.weight-inline-control/)
 const w=read('src/styles/weather-panel.css')
 assert.match(w,/\.wx-brief-line/)
 assert.match(read('src/components/WeatherPanel.tsx'),/if\(compact&&mode==='training'\)/)
})

test('all current project views keep owner gate and race weather untouched',()=>{
 const app=read('src/App.tsx')
 assert.match(app,/<OnlineAccessGate>/)
 const race=read('src/pages/RacePage.tsx')
 assert.match(race,/<RaceForecastCompact active=\{active\}/)
})

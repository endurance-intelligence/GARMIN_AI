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
 assert.match(c,/<details className="co-extra co-demo"/)
 assert.match(c,/\{demoOpen&&<div className="co-extra-content">/)
 assert.doesNotMatch(c,/<LiveRecovery active=/)
 assert.ok(c.indexOf('<CoachGlance')<c.indexOf('className="stage v3-stage"'))
 assert.ok(c.indexOf('<CoachGlance')<c.indexOf('className="stage v3-stage"'))
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

test('Coach preview is clearly marked demo and available only on demand',()=>{
 const c=read('src/pages/CoachPage.tsx')
 assert.match(c,/Coach-Prototyp ansehen · Demo/)
 assert.match(c,/DEMO · keine Änderung am Trainingsplan/)
 assert.match(c,/onToggle=\{event=>setDemoOpen\(event.currentTarget.open\)\}/)
})

test('overview is backed by existing authenticated Garmin services',()=>{
 const c=read('src/components/CoachGlance.tsx')
 for(const endpoint of ['garmin-weekly-options','garmin-training-plan','read-garmin-health']){
  assert.ok(c.includes(endpoint),endpoint)
 }
 assert.match(c,/garminSupabase.auth.getSession\(\)/)
 assert.match(c,/authorization:'Bearer '\+token/)
 assert.match(c,/cache:'no-store'/)
 assert.match(c,/Noch kein fester Termin/)
 assert.match(c,/Kein fester Starttermin/)
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

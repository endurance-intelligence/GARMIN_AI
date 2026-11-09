import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('iPad compact 761–1024px uses bottom touch nav, not cramped desktop sidebar',()=>{
  const css=read('src/styles/mobile-ux-v084.css')
  assert.match(css,/@media\s*\(min-width:761px\)\s*and\s*\(max-width:1024px\)/)
  assert.match(css,/\.sidebar\s*\{display:none\}/)
  assert.match(css,/\.footmobile\s*\{[^}]*display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/s)
  assert.match(css,/min-height:calc\(75px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(css,/\.main\s*\{[^}]*calc\(116px \+ env\(safe-area-inset-bottom\)\)/s)
})

test('real Garmin recovery appears before simulated coach recommendation',()=>{
  const coach=read('src/pages/CoachPage.tsx')
  const iRecovery=coach.indexOf('<LiveRecovery active={active}')
  const iDemo=coach.indexOf('className="stage v3-stage"')
  assert.ok(iRecovery>=0&&iRecovery<iDemo)
  assert.match(coach,/Echte Messwerte · zuletzt synchronisiert/)
  assert.match(coach,/DEMO · keine Änderung am Trainingsplan/)
  const css=read('src/styles/mobile-ux-v084.css')
  assert.match(css,/\.introduction-v3 \.seg\s*\{[^}]*display:inline-flex/s)
})

test('training data source disclaimer does not falsely describe real sessions as demo',()=>{
  const training=read('src/pages/TrainingPage.tsx')
  assert.match(training,/DIE SESSION-ANALYSE OBEN VERWENDET ECHTE GARMIN-DATEN/)
  assert.match(training,/NUR DIE BEISPIELANALYSEN UNTERHALB DER DEMO-TRENNLINIE/)
  assert.doesNotMatch(training,/ALLE AKTIVITÄTEN UND WERTE AUF DIESER SEITE SIND DEMODATEN/)
})

test('equipment cards, charts and recovery data are touch-sized on iPhone',()=>{
  const css=read('src/styles/mobile-ux-v084.css')
  assert.match(css,/\.gcs-visual-list\s*\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(css,/\.gcs-archive summary\s*\{min-height:45px/)
  assert.match(css,/\.lsa-picker select\s*\{min-width:0;font-size:16px;min-height:49px\}/)
  assert.match(css,/\.ri-metric-grid\s*\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(css,/@media \(max-width:390px\)/)
})

test('settings shortcuts reach real non-destructive sections',()=>{
  const settings=read('src/pages/SettingsPage.tsx')
  for(const id of ['settings-sync','settings-account','settings-zones']){
    assert.match(settings,new RegExp('getElementById\\(\\\''+id+'\\\'\\)'))
    assert.ok(settings.includes('id="'+id+'"'))
  }
  assert.match(settings,/className="settings-shortcuts"/)
  assert.match(settings,/<SyncCenter active=\{active\} mode="status"\/>/)
  assert.match(settings,/<GarminAuthSettings\/>/)
  assert.match(settings,/<HeartRateZonesSettings active=\{active\}\/>/)
})

test('layout-only release preserves owner gate, weight writes and all private services',()=>{
  const app=read('src/App.tsx')
  assert.match(app,/import '.\/styles\/mobile-first.css'/)
  assert.match(app,/import '.\/styles\/mobile-ux-v084.css'/)
  assert.match(app,/<OnlineAccessGate>/)
  assert.match(app,/aria-current=\{page===item.id\?'page':undefined\}/)
  const css=read('src/styles/mobile-ux-v084.css')
  assert.doesNotMatch(css,/service_role|oauth_token|Authorization\s*:/i)
  const sync=read('src/components/SyncCenter.tsx')
  assert.match(sync,/session,'POST',\{date,kg\}/)
  assert.match(sync,/Übertragung zu Garmin Connect steht noch aus/)
})

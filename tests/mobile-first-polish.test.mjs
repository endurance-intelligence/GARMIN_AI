import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('mobile-first stylesheet is last in app after Horizon',()=>{
  const app=get('src/App.tsx')
  const old=app.indexOf("import './styles/horizon.css'")
  const modern=app.indexOf("import './styles/mobile-first.css'")
  assert.ok(old>=0 && modern>old)
})

test('mobile layout has genuinely shrinkable one-column content and two-column metrics',()=>{
  const css=get('src/styles/mobile-first.css')
  assert.match(css,/@media\s*\(max-width:\s*760px\)/)
  assert.match(css,/\.v3-stage,\s*\.stage,\s*\.v3-decision-layout/)
  assert.match(css,/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(css,/\.metric-grid,\s*\.v3-metric-grid,\s*\.session-stat-grid/)
  assert.match(css,/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(css,/\.v3-session-switch\s*\{[^}]*overflow-x:\s*auto/s)
})

test('bottom navigation accounts for iOS safe area and five readable tabs',()=>{
  const css=get('src/styles/mobile-first.css')
  assert.match(css,/\.footmobile\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,1fr\)\)/s)
  assert.match(css,/\.footmobile\s*\{[^}]*env\(safe-area-inset-bottom\)/s)
  assert.match(css,/\.footmobile button\s*\{[^}]*min-height:\s*48px/s)
  assert.match(css,/\.main\s*\{[^}]*calc\(110px \+ env\(safe-area-inset-bottom\)\)/s)
})

test('inputs avoid mobile Safari zoom and charts cannot push page beyond viewport',()=>{
  const css=get('src/styles/mobile-first.css')
  assert.match(css,/\.app select,\s*\.app textarea/)
  assert.match(css,/\.online-gate input\s*\{\s*font-size:\s*16px/s)
  assert.match(css,/\.big-chart svg,\s*\.lsa-chart svg/)
  assert.match(css,/max-width:\s*100%/)
})

test('mobile-only CSS does not change Garmin permissions or data services',()=>{
  const css=get('src/styles/mobile-first.css')
  assert.doesNotMatch(css,/(access.token|service_role|oauth|apikey|GARMIN_API_KEY)/i)
  assert.match(get('src/App.tsx'),/<OnlineAccessGate>/)
})

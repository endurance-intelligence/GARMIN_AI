import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('date is inside the compact quick-entry header, not in a long form row',()=>{
  const jsx=read('src/components/SyncCenter.tsx')
  const heading=jsx.indexOf('className="sync-top sync-weight-top"')
  const date=jsx.indexOf('className="sync-date-field"',heading)
  const form=jsx.indexOf('className="sync-weigh-form"',heading)
  assert.ok(heading>=0 && date>heading && form>date)
  assert.match(jsx,/className="sync-weight-heading"/)
  assert.match(jsx,/className="sync-weight-save"/)
  assert.match(jsx,/shortWeightDate\(date\)/)
  assert.match(jsx,/timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'/)
})

test('compact entry uses one dark picker + one save action, preserves wheel dialog',()=>{
  const jsx=read('src/components/SyncCenter.tsx')
  const css=read('src/styles/sync-center.css')
  assert.match(jsx,/<WeightWheelPicker key=\{inlineWheel\?date:undefined\}[\s\S]*?value=\{weight\} onChange=\{setWeight\}/)
  assert.match(jsx,/onClick=\{\(\)=>void save\(\)\}/)
  assert.match(css,/\.sync-center\.sync-center-weight\s*\{[^}]*max-width:520px/s)
  assert.match(css,/\.sync-center-weight \.sync-weigh-form\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 148px/s)
  assert.match(css,/\.sync-center-weight \.sync-weigh-form \.weight-control-trigger\s*\{[^}]*background:linear-gradient\(/s)
  assert.match(css,/\.sync-center-weight \.weight-control-help\{display:none\}/)
  assert.match(read('src/components/WeightWheelPicker.tsx'),/role="dialog" aria-modal="true"/)
})

test('narrow iPhone stacks picker and button with sufficient touch height',()=>{
  const css=read('src/styles/sync-center.css')
  assert.match(css,/@media\(max-width:570px\)\s*\{[\s\S]*?\.sync-center-weight \.sync-weigh-form\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/)
  assert.match(css,/\.sync-center-weight \.sync-weigh-form > \.sync-weight-save\s*\{[^}]*min-height:44px/s)
  assert.match(css,/@media\(max-width:350px\)/)
  assert.match(css,/\.sync-center-weight \.sync-date-field input\[type="date"\]/)
})

test('weight quick entry never assumes Garmin has received the measurement',()=>{
  const jsx=read('src/components/SyncCenter.tsx')
  assert.match(jsx,/session,'POST',\{date,kg\}/)
  assert.match(jsx,/Garmin-Übertragung folgt nach Freigabe/)
  assert.match(jsx,/Übertragung zu Garmin Connect steht noch aus/)
})

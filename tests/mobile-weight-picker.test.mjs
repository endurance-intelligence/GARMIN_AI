import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {weightFromParts,weightToParts} from '../src/lib/weightPickerMath.ts'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('native iPhone picker uses two selects with real saved weight state',()=>{
  const picker=read('src/components/WeightWheelPicker.tsx')
  const center=read('src/components/SyncCenter.tsx')
  assert.match(picker,/\<select aria-label="Ganze Kilogramm auswählen"/)
  assert.match(picker,/\<select aria-label="Zehntel Kilogramm auswählen"/)
  assert.match(center,/\<WeightWheelPicker value=\{weight\} onChange=\{setWeight\}/)
  assert.match(center,/session,'POST',\{date,kg\}/)
  assert.match(center,/Übertragung zu Garmin Connect steht noch aus/)
  assert.doesNotMatch(picker,/inputMode="decimal"|type="number"/)
})

test('exact kg and tenths are combined without floating point noise',()=>{
  assert.equal(weightFromParts('77','5'),'77.5')
  assert.equal(weightFromParts('75','0'),'75.0')
  assert.equal(weightFromParts('30','0'),'30.0')
  assert.equal(weightFromParts('300','0'),'300.0')
  assert.deepEqual(weightToParts('77,5'),{whole:'77',decimal:'5'})
  assert.deepEqual(weightToParts('75.0'),{whole:'75',decimal:'0'})
  assert.deepEqual(weightToParts(''),{whole:'',decimal:'0'})
})

test('weight range is enforced and no fraction above 300kg is allowed',()=>{
  for(const [whole,decimal] of [
    ['','0'],['29','9'],['300','1'],['301','0'],['999','0'],
    ['77','10'],['x','1']
  ])assert.equal(weightFromParts(whole,decimal),'')
  assert.deepEqual(weightToParts('NaN'),{whole:'',decimal:'0'})
  assert.deepEqual(weightToParts('20.0'),{whole:'',decimal:'0'})
})

test('iPhone date is laid out full-width in a single mobile column',()=>{
  const css=read('src/styles/sync-center.css')
  assert.match(css,/\.sync-date-field input\[type="date"\]/)
  assert.match(css,/min-width:0;max-width:100%;width:100%/)
  assert.match(css,/@media \(max-width:760px\)\s*\{[\s\S]*?\.sync-weigh-form\s*\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/)
  assert.match(read('src/components/SyncCenter.tsx'),/className="sync-date-field"/)
})

test('iPhone platform picker and assistive labels remain native',()=>{
  const picker=read('src/components/WeightWheelPicker.tsx')
  assert.match(picker,/role="group"/)
  assert.match(picker,/aria-label="Ganze Kilogramm auswählen"/)
  assert.match(picker,/aria-label="Zehntel Kilogramm auswählen"/)
  assert.match(picker,/disabled=\{disabled\|\|!whole\|\|whole==='300'\}/)
  assert.match(read('src/components/WeightWheelPicker.css'),/max-width:100%/)
})

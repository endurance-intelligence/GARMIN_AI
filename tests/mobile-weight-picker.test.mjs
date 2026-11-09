import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {weightFromParts,weightToParts} from '../src/lib/weightPickerMath.ts'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('weight input is one button, not two cramped selects on the form',()=>{
  const picker=read('src/components/WeightWheelPicker.tsx')
  const center=read('src/components/SyncCenter.tsx')
  assert.match(picker,/className="weight-control-trigger"/)
  assert.match(picker,/aria-haspopup="dialog"/)
  assert.match(picker,/createPortal\(/)
  assert.match(picker,/role="dialog" aria-modal="true"/)
  assert.doesNotMatch(picker,/<select[\s>]/)
  assert.match(center,/<WeightWheelPicker key=\{inlineWheel\?date:undefined\}[\s\S]*?value=\{weight\} onChange=\{setWeight\}/)
})

test('two vertical swipe wheels scroll snap, select actual 0.1kg and require confirm',()=>{
  const picker=read('src/components/WeightWheelPicker.tsx')
  const css=read('src/components/WeightWheelPicker.css')
  assert.match(picker,/const ROW=48/)
  assert.match(picker,/onScroll=\{onScroll\}/)
  assert.match(picker,/role="listbox"/)
  assert.match(picker,/onClick=\{choose\}/)
  assert.match(picker,/weightFromParts\(whole,whole==='300'\?'0':fraction\)/)
  assert.match(css,/scroll-snap-type:y mandatory/)
  assert.match(css,/touch-action:pan-y/)
  assert.match(css,/height:240px/)
  assert.match(css,/@media\(min-width:700px\)/)
  assert.match(css,/safe-area-inset-bottom/)
})

test('date renders as a separate compact display; native date is only the touch target',()=>{
  const center=read('src/components/SyncCenter.tsx')
  const css=read('src/styles/sync-center.css')
  assert.match(center,/shortWeightDate\(date\)/)
  assert.match(center,/className="sync-date-display"/)
  assert.match(center,/type="date" aria-label="Datum auswählen"/)
  assert.match(center,/className=\{mode==='weight'\?'sync-center sync-center-weight'/)
  assert.match(css,/\.sync-center-weight \.sync-date-field input\[type="date"\]/)
  assert.match(css,/position:absolute;inset:0;z-index:2/)
  assert.match(css,/opacity:0/)
  assert.match(css,/\.sync-center-weight \.sync-weigh-form\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/s)
})

test('weight selection alone does not write to Supabase or Garmin',()=>{
  const picker=read('src/components/WeightWheelPicker.tsx')
  const center=read('src/components/SyncCenter.tsx')
  assert.doesNotMatch(picker,/fetch\(|garminSupabase|\.rpc\(|session,'POST'/i)
  assert.match(center,/session,'POST',\{date,kg\}/)
  assert.match(center,/onClick=\{\(\)=>void save\(\)\}/)
  assert.match(center,/Gewicht gespeichert\. Übertragung zu Garmin Connect steht noch aus\./)
})

test('exact value conversion and upper range are retained',()=>{
  assert.equal(weightFromParts('77','5'),'77.5')
  assert.equal(weightFromParts('75','0'),'75.0')
  assert.equal(weightFromParts('300','0'),'300.0')
  assert.equal(weightFromParts('300','1'),'')
  assert.equal(weightFromParts('29','9'),'')
  assert.equal(weightFromParts('301','0'),'')
  assert.deepEqual(weightToParts('77,5'),{whole:'77',decimal:'5'})
  assert.deepEqual(weightToParts(''),{whole:'',decimal:'0'})
})

test('responsive sheet has large iPhone touch targets and iPad centered dialog',()=>{
  const css=read('src/components/WeightWheelPicker.css')
  assert.match(css,/\.weight-control-trigger\s*\{[^}]*min-height:78px/s)
  assert.match(css,/\.weight-sheet-actions button\s*\{[^}]*min-height:54px/s)
  assert.match(css,/\.weight-sheet-backdrop\s*\{[^}]*position:fixed/s)
  assert.match(css,/@media\(min-width:700px\)\s*\{[^}]*\.weight-sheet-backdrop\{align-items:center/s)
})

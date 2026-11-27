import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const app=read('src/App.tsx'),css=read('src/styles/navigation-mobile.css'),analyst=read('src/components/LiveSessionAnalyst.tsx')
test('six consistent mobile destinations with safe areas, accessible controls and no fake bell',()=>{
 assert.match(app,/name:'Analyse',icon:'activity',mobile:'Analyse'/)
 assert.match(app,/\['gear','settings','strength'\].includes\(page\)&&<button[^>]*onClick=\{\(\)=>go\('more'\)\}/)
 assert.doesNotMatch(app,/<Icon name="bell"\/>/)
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/)
 assert.match(css,/env\(safe-area-inset-left\)/)
 assert.match(css,/env\(safe-area-inset-right\)/)
 assert.match(css,/min-height:48px/)
 assert.match(css,/\.footmobile button span\{[^}]*overflow-wrap:anywhere/)
})
test('explicit activity focus is consumed once and manual selection survives refresh and tab changes',()=>{
 assert.match(analyst,/if\(focus&&consumedFocus.current!==focus.token\)/)
 assert.match(analyst,/consumedFocus.current=focus.token/)
 assert.match(analyst,/const requested=requestedActivity.current/)
 assert.match(analyst,/requestedActivity.current='';setDetails\(null\);setSelected\(e.target.value\)/)
 assert.match(analyst,/scrolledFocus.current===focus.token\)return/)
 assert.match(analyst,/if\(found\)setSelected\(requested\)/)
 assert.match(analyst,/Es wird kein anderer Lauf stillschweigend geöffnet/)
})
test('calendar dialogs keep their close control available during long mobile reviews',()=>{
 assert.match(css,/\.coach-day-dialog>header,\.hc-group-dialog>header\{position:sticky;top:0/)
 assert.match(css,/max-height:calc\(100dvh - 24px - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)/)
 assert.match(read('src/pages/CalendarPage.tsx'),/decisionDialog.current\?\.close\(\)/)
})

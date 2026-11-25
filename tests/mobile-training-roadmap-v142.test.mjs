import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('roadmap includes all computed weeks with a real selection, current default and race milestone',()=>{
 const s=read('src/components/CoachLongTermPlan.tsx')
 assert.match(s,/plan.weeks.map\(w=>/)
 assert.match(s,/plan.weeks.find\(w=>w.isCurrent\)/)
 assert.match(s,/selection\?\.identity===identity/)
 assert.match(s,/aria-pressed=\{week\?\.start===w.start\}/)
 assert.match(s,/onClick=\{\(\)=>setSelection\(\{identity,start:w.start\}\)\}/)
 assert.match(s,/w.isRaceWeek\?'DEIN ZIEL'/)
 assert.match(s,/Zur aktuellen Woche/)
})
test('unknown mileage and long runs stay unknown, all coaching guidance retained on demand',()=>{
 const s=read('src/components/CoachLongTermPlan.tsx')
 assert.match(s,/week.targetKm!==null\?week.targetKm.low/)
 assert.match(s,/week.longRunMinutes!==null\?week.longRunMinutes:'—'/)
 assert.match(s,/week.qualityOptions>0/)
 assert.match(s,/week.focus/)
 assert.match(s,/week.polarization/)
 assert.match(s,/plan.notes.map/)
 assert.match(s,/<details className="cltp-explanation">/)
 assert.doesNotMatch(s,/fetch\(|supabase|\.upsert\(|\.insert\(/)
})
test('roadmap uses responsive grid, reduced motion and keyboard focus styles',()=>{
 const css=read('src/styles/coach-long-term.css')
 assert.match(css,/repeat\(auto-fit,minmax\(135px,1fr\)\)/)
 assert.match(css,/repeat\(2,minmax\(0,1fr\)\)/)
 assert.match(css,/prefers-reduced-motion/)
 assert.match(css,/button:focus-visible/)
 assert.match(css,/\.cltp-root button.cltp-back-current/)
})

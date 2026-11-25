import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('today hero and actual recovery before weekly actions, questions are on demand',()=>{
 const p=read('src/pages/CoachPage.tsx'),g=read('src/components/CoachGlance.tsx'),b=read('src/components/CoachDailyBrief.tsx')
 assert.match(p,/compactToday=\{!!dailyBrief&&!snapshotLoading&&!snapshotError\}/)
 assert.match(g,/<details className="co-today co-today-details" open=\{compactToday\?undefined:true\}/)
 assert.match(p,/id="coach-ask"/)
 assert.ok(p.indexOf('<CoachSevenDay')<p.indexOf('<AskCoachCard'))
 assert.match(b,/open=\{cautious\|\|brief.label==='TEILNAHME BESTÄTIGT'\?true:undefined\}/)
 assert.match(b,/brief\.dataNote/)
 assert.match(b,/brief\.symptomNote/)
 assert.match(b,/brief\.minutes!==null&&brief.label!=='TEILNAHME BESTÄTIGT'/)
})
test('day cards retain selected attendance and actual decision controls, today shortcut chooses today',()=>{
 const p=read('src/pages/CoachPage.tsx'),s=read('src/components/CoachSevenDay.tsx'),d=read('src/components/CoachDecisionLive.tsx')
 assert.match(p,/button\[data-coach-date=/)
 assert.match(p,/current&&!current.disabled/)
 assert.match(s,/data-coach-date=\{day.date\}/)
 assert.match(s,/day.selectedGroup.advice==='skip'\?'Coach rät ab'/)
 assert.match(s,/onClick=\{\(\)=>void accept\(day\)\}/)
 assert.match(d,/onReview\(day.date\)/)
 assert.match(d,/onDecline\(day.date\)/)
 assert.match(d,/onCustom\(day.date\)/)
})
test('responsive goal-inspired styling retains focus and true metric components',()=>{
 const css=read('src/styles/coach-roadmap.css')
 assert.match(css,/repeat\(7,minmax\(0,1fr\)\)/)
 assert.match(css,/repeat\(2,minmax\(0,1fr\)\)/)
 assert.match(css,/\.co-home button:focus-visible/)
 assert.match(read('src/components/CoachGlance.tsx'),/<RecoverySparkline/)
})

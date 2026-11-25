import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('today hero and actual recovery before weekly actions, questions are on demand',()=>{
 const p=read('src/pages/CoachPage.tsx'),g=read('src/components/CoachGlance.tsx'),b=read('src/components/CoachDailyBrief.tsx')
 assert.match(p,/compactToday=\{!!dailyBrief&&!snapshotLoading&&!snapshotError\}/)
 assert.match(g,/<details className="co-today co-today-details" open=\{compactToday\?undefined:true\}/)
 assert.match(p,/id="coach-ask"/)
 assert.ok(p.indexOf('<CoachGlance')<p.indexOf('<AskCoachCard'))
 assert.doesNotMatch(p,/<CoachSevenDay/)
 assert.match(b,/open=\{cautious\|\|brief.label==='TEILNAHME BESTÄTIGT'\?true:undefined\}/)
 assert.match(b,/brief\.dataNote/)
 assert.match(b,/brief\.symptomNote/)
 assert.match(b,/brief\.minutes!==null&&brief.label!=='TEILNAHME BESTÄTIGT'/)
})
test('day cards retain selected attendance and actual decision controls, today shortcut chooses today',()=>{
 const p=read('src/pages/CoachPage.tsx'),s=read('src/components/CoachSevenDay.tsx'),d=read('src/components/CoachDecisionLive.tsx')
 assert.match(p,/openCoachDecision=\(\)=>onOpenDecision\(coachToday\)/)
 assert.match(read('src/pages/CalendarPage.tsx'),/focus=\{decisionFocus\}/)
 assert.match(s,/data-coach-date=\{day.date\}/)
 assert.match(s,/day.selectedGroup.advice==='skip'\?'Coach rät ab'/)
 // The confirmation now selects exactly one branch instead of always accepting the original.
 assert.match(s,/onClick=\{\(\)=>\{if\(variant==='alternative'\)\{if\(alternative\)void acceptAlternative\(day,alternative\)\}else void accept\(day\)\}\}/)
 assert.match(s,/disabled=\{saving!==null\|\|\(variant==='alternative'&&!alternative\)\}/)
 assert.match(s,/plan.days.find\(x=>x.date===day.date\)!==day/)
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

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Coach home prioritizes daily decision, questions and weekly actions ahead of secondary information',()=>{
 const s=read('src/pages/CoachPage.tsx')
 const order=['<CoachDailyBrief','<CoachGlance','id="coach-ask"','<AskCoachCard']
 for(let i=1;i<order.length;i++)assert.ok(s.indexOf(order[i])>s.indexOf(order[i-1]),order[i])
 assert.doesNotMatch(s,/<CoachSevenDay|<CoachProgressPulse|<CoachSessionBridge|<CoachGoalPanel/)
 assert.match(read('src/components/TrainingDevelopment.tsx'),/<CoachProgressPulse[\s\S]*<CoachSessionBridge/)
})
test('race recovery and stale plans remain visible, retrospective cards follow decisions',()=>{
 const s=read('src/components/CoachSevenDay.tsx')
 const nav=s.indexOf('id="c7-week-overview"')
 const details=s.indexOf('id="c7-analysis-details"')
 assert.ok(s.indexOf('<CoachRaceRecoveryCard')<nav)
 assert.ok(s.indexOf('className="c7-stale-plan"')<nav)
 assert.ok(nav<s.indexOf('<CoachDecisionLive'))
 assert.ok(s.indexOf('<CoachDecisionLive')<details)
 for(const card of ['GarminFeedbackCard','CoachNextImpactCard','CoachAdaptiveVolumeCard','CoachFourWeekCard','CoachMemoryCard','CoachLongTermCard','WeeklyPlanActualCard'])
  assert.ok(s.indexOf('<'+card)>details,card)
})
test('existing progress shortcuts reveal the collapsed parent before scrolling',()=>{
 const s=read('src/components/CoachLongTermCard.tsx')
 assert.match(s,/getElementById\('c7-analysis-details'\)/)
 assert.match(s,/parent instanceof HTMLDetailsElement\)parent.open=true[\s\S]*setExpanded\(true\)/)
 assert.match(s,/garmin-ai-open-long-term-progress/)
})
test('only evidence-backed one-tap questions are shown, answers remain accessible',()=>{
 const s=read('src/components/AskCoachCard.tsx')
 assert.match(s,/availableCoachQuestions\(\{today,snapshot,plan,weather\}\)/)
 assert.match(s,/questions\.map\(q=>/)
 assert.match(s,/onClick=\{\(\)=>send\(q.label,q.id\)\}/)
 assert.doesNotMatch(s,/<form|<input/)
 assert.match(s,/aria-live="polite"/)
})

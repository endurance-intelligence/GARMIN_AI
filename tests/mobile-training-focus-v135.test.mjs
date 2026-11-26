import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {summarizeRunMetrics} from '../src/lib/runMetrics.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('actual Garmin summary derives pace and normalizes RPE without inventing missing values',()=>{
 const m=summarizeRunMetrics({distanceM:10000,durationS:3600,avgHr:142,rpeRaw:70})
 assert.equal(m.find(x=>x.key==='pace').value,'6:00')
 assert.equal(m.find(x=>x.key==='rpe').value,'7')
 assert.equal(m.find(x=>x.key==='duration').value,'60:00')
 assert.ok(summarizeRunMetrics({distanceM:0,durationS:null,avgHr:0,rpeRaw:0}).every(x=>x.value==='–'))
 assert.equal(summarizeRunMetrics({distanceM:1000,durationS:359.9})[2].value,'6:00')
})
test('run summary and coach conclusion precede optional technical details; stale run detail cannot leak',()=>{
 const s=read('src/components/LiveSessionAnalyst.tsx')
 assert.ok(s.indexOf('className="lsa-run-summary"')<s.indexOf('<SessionCoachContext key='))
 assert.ok(s.indexOf('<SessionCoachContext key=')<s.indexOf('<PlanActualReview match='))
 assert.ok(s.indexOf('<PlanActualReview match=')<s.indexOf('<details className="lsa-deep-dive">'))
 assert.match(s,/<CoachEvidenceSummary active=\{active\} mode="training" activityId=\{activity.id\} embedded\/>/)
 assert.match(s,/loadedDetails\?\.activity.id===selected\?loadedDetails:null/)
 assert.doesNotMatch(s,/Garmin-RPE Rohwert/)
})
test('training reuses existing progress cards and lazily loads four completed weeks, no write operations',()=>{
 const page=read('src/pages/TrainingPage.tsx'),s=read('src/components/TrainingDevelopment.tsx')
 assert.match(page,/<TrainingDevelopment active=\{active\} focusToken=\{focus\?\.token\}/)
 assert.match(s,/if\(!active\|\|!open\|\|!garminSupabase\)/)
 assert.match(s,/loadCoachSnapshot\(session,today,controller.signal,undefined,4\)/)
 assert.match(s,/<CoachProgressPulse/)
 assert.match(s,/<CoachLongTermCard/)
 assert.match(s,/controller.abort\(\)/)
 assert.doesNotMatch(s,/\.insert\(|\.update\(|\.upsert\(|method:'POST'/)
})

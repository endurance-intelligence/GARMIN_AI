import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSessionContext} from '../src/lib/sessionContext.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const prior={id:'u',sport:'running',date:'2026-11-21 06:00:00',distanceM:50700,durationS:28800,avgHr:135,rpeRaw:60}
const activity={id:'r',sport:'running',date:'2026-11-25 19:00:00',distanceM:10010,durationS:3840,avgHr:135,rpeRaw:30}
test('early post-ultra run remains caution even with low RPE; distinguish retrospective inference from history',()=>{
 const r=buildSessionContext(activity,[prior,activity])
 assert.equal(r.mode,'caution')
 assert.equal(r.mood,'firm')
 assert.match(r.recommendation,/4 Tage nach 50,7 km/)
 assert.match(r.recommendation,/Eine gespeicherte damalige Coach-Ansage liegt dieser Ableitung nicht zugrunde/)
 assert.match(r.verdict,/Gutes Belastungsgefühl/)
})
test('ordinary low effort is positive without pretending medical clearance',()=>{
 const r=buildSessionContext(activity,[activity])
 assert.equal(r.mode,'positive')
 assert.equal(r.mood,'supportive')
 assert.equal(r.recommendation,null)
 const missing=buildSessionContext({...activity,rpeRaw:null},[])
 assert.equal(missing.mode,'review')
 assert.equal(missing.mood,'focused')
})
test('one visible verdict with large avatar, embedded evidence and unchanged weekly review',()=>{
 const view=read('src/components/LiveSessionAnalyst.tsx')
 const evidence=read('src/components/CoachEvidenceSummary.tsx')
 const css=read('src/styles/session-live.css')
 assert.equal((view.match(/<CoachEvidenceSummary /g)||[]).length,1)
 assert.ok(view.includes('activityId={activity.id} embedded'))
 assert.ok(view.includes('<CoachAvatar mood={context.mood}/>'))
 assert.ok(view.includes('context.modeLabel'))
 assert.ok(evidence.includes("embedded&&mode==='training'"))
 assert.ok(evidence.includes('r.attention'))
 assert.ok(evidence.includes('r.goal'))
 assert.ok(evidence.includes('result&&showWeek'))
 assert.match(css,/\.lsa-coach-hero\s*\{display:grid/)
 assert.ok(css.includes('224px'))
})

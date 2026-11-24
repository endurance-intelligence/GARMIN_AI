import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {answerCoachQuestion,resolveCoachQuestion,COACH_QUESTIONS} from '../src/lib/askCoach.mjs'
const today='2026-11-24'
const snapshot={health:{metrics:[]},boards:[],plans:{entries:[]},goal:{},life:{context:{}}}
const plan={today,days:[{date:today,kind:'recovery',title:'Erholung',reason:'Original Coach-Begründung',minutes:null}],signals:[],attentionText:'Erholung hat Vorrang.'}
const ask=(topic,p=plan,s=snapshot)=>answerCoachQuestion({topic,today,snapshot:s,plan:p})
test('all supported questions resolve and safety wording takes priority',()=>{
 for(const q of COACH_QUESTIONS)assert.equal(resolveCoachQuestion(q.label),q.id)
 assert.equal(resolveCoachQuestion('Heute laufen trotz Brustschmerzen?'),'symptoms')
 assert.equal(resolveCoachQuestion('Was ist die Hauptstadt von Frankreich?'),null)
})
test('today reuses exact recommendation, reason and missing-data warning',()=>{
 const x=ask('today')
 assert.equal(x.title,'Erholung')
 assert.ok(x.body.includes('Original Coach-Begründung'))
 assert.match(x.body.join(' '),/nicht verfügbar/)
 assert.equal(x.action,'decision')
})
test('stale or absent plan never generates personalized claims',()=>{
 assert.match(ask('today',{...plan,today:'2026-11-23'}).title,/fehlen/)
 assert.match(ask('recovery',null).title,/fehlen/)
 assert.equal(ask('symptoms',null).action,'symptoms')
})
test('unknown question has explicit scope and does not modify the plan',()=>{
 const before=JSON.stringify(plan)
 assert.match(ask(null).title,/noch nicht zuverlässig/)
 assert.match(ask('week').body[0],/Original Coach-Begründung/)
 assert.equal(JSON.stringify(plan),before)
})
test('progress, goal and memory handle missing evidence honestly',()=>{
 assert.match(ask('goal').title,/kein aktives Wettkampfziel/)
 assert.match(ask('progress').body.join(' '),/nicht vollständig|nicht belegbar|keine Aussage|fehlende/i)
 assert.match(ask('memory').body.join(' '),/Noch kein eindeutig zugeordnetes Ergebnis/)
})
test('embedded only in valid shared snapshot, no new network or storage',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/pages/CoachPage.tsx'),/sharedSnapshot&&dailyPlan&&!snapshotLoading&&!snapshotError&&<AskCoachCard/)
 for(const p of ['src/lib/askCoach.mjs','src/components/AskCoachCard.tsx'])
  assert.doesNotMatch(read(p),/fetch\(|localStorage|\.insert\(|\.upsert\(/)
})

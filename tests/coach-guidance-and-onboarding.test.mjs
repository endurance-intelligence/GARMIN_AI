import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {coachRecoveryAdvice} from '../src/lib/coachRecoveryAdvice.mjs'
import {availableCoachQuestions,answerCoachQuestion} from '../src/lib/askCoach.mjs'
const today='2026-10-12'
const shift=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const baseline=Array.from({length:16},(_,i)=>({metric_date:shift(i-16),sleep_seconds:7.5*3600,hrv_ms:60,resting_heart_rate:50,stress_avg:20,body_battery_max:90}))
const current={metric_date:today,sleep_seconds:7.5*3600,hrv_ms:60,resting_heart_rate:50}
const plan={today,days:[{date:today,kind:'easy',title:'Lockerer Lauf',reason:'Grundlage',minutes:30}],signals:[]}
const assess=(row,p=plan,extra={})=>coachRecoveryAdvice({today,history:[...baseline,row],plan:p,context:{illness_state:'well'},...extra})
test('mixed measured recovery suggests conditional easy training, not permission or rigid ban',()=>{
 const r=assess({...current,sleep_seconds:5.8*3600,hrv_ms:66,resting_heart_rate:53})
 assert.equal(r.level,'caution')
 assert.match(r.evidence,/weniger Schlaf/)
 assert.match(r.evidence,/HRV höher/)
 assert.match(r.advice,/wirklich gut/)
 assert.match(r.tip,/abbrechen|Einlaufen/)
})
test('combined objective signals take priority even when the athlete has an easy plan',()=>{
 const r=assess({...current,sleep_seconds:5.5*3600,hrv_ms:45,resting_heart_rate:58})
 assert.equal(r.level,'caution')
 assert.match(r.title,/Bremse/)
 assert.match(r.tip,/Keine Intervalle/)
})
test('good values never override illness, rest, missing measurements or completed training',()=>{
 assert.equal(assess(current,plan,{context:{illness_state:'sick'}}).level,'pause')
 assert.equal(assess(current,{...plan,days:[{...plan.days[0],kind:'recovery'}]}).level,'rest')
 assert.equal(assess(current,plan,{completed:true}).level,'rest')
 assert.equal(assess({...current,metric_date:shift(-1)}).level,'limited')
 assert.equal(assess(current,null).level,'limited')
})
test('completed-day stress, battery and recent training feedback influence guidance',()=>{
 const rows=[...baseline.map(r=>r.metric_date===shift(-1)?{...r,stress_avg:37,body_battery_max:65}:r),current]
 const r=coachRecoveryAdvice({today,history:rows,plan:{...plan,garminPerception:{latest:{date:shift(-1)},needsRecovery:true,qualityCaution:true}},context:{illness_state:'well'}})
 assert.equal(r.level,'caution')
 assert.match(r.evidence,/Tagesstress/)
 assert.match(r.evidence,/Body Battery/)
 assert.match(r.evidence,/Garmin-Bewertungen/)
 const partial=assess({...current,stress_avg:100,body_battery_max:0})
 assert.equal(partial.level,'balanced')
})
test('only evidence-backed question buttons, recovery answer reuses same guidance',()=>{
 const empty={health:{metrics:[]},boards:[],plans:{entries:[]},goal:{},life:{context:{}}}
 const input={today,snapshot:empty,plan}
 assert.deepEqual(availableCoachQuestions(input).map(q=>q.id),['today','method','week'])
 const snapshot={...empty,health:{metrics:[...baseline,current]}}
 const r=availableCoachQuestions({...input,snapshot})
 assert.ok(r.some(q=>q.id==='recovery'))
 assert.ok(!r.some(q=>q.id==='weather'))
 assert.equal(answerCoachQuestion({...input,snapshot,topic:'recovery'}).title,assess(current).title)
})
test('runner workspace remains in source but does not mount; second login wizard is optional and isolated',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const race=read('src/pages/RacePage.tsx'),gate=read('src/components/OnlineAccessGate.tsx'),setup=read('src/components/SecondaryOnboarding.tsx'),ask=read('src/components/AskCoachCard.tsx')
 assert.match(race,/SHOW_RUNNER_MODE=false/)
 assert.match(race,/SHOW_RUNNER_MODE&&<RaceStrategyCard/)
 assert.match(gate,/VITE_GARMIN_INSTANCE==='secondary'/)
 assert.match(setup,/garmin-ai-onboarding-v1:'\+userId/)
 assert.match(setup,/<IntervalsConnection active/)
 assert.match(setup,/<TrainingRhythmSettings active/)
 assert.doesNotMatch(ask,/<input|<form/)
})

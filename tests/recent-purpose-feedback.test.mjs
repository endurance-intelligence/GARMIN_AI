import test from 'node:test'
import assert from 'node:assert/strict'
import {recentEasyCandidates,priorGarminUpper,compactPurposeExposure,recentPurposeFeedback} from '../src/lib/recentPurposeFeedback.mjs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
const today='2026-11-28',date='2026-11-27'
const row={activity_id:'123',start_time_local:date+' 18:00:00',sport_type:'running',distance_m:8000,duration_s:3600,average_heart_rate:160,rpe_raw:20}
const plan={id:'p',training_date:date,title:'Locker',sport:'running',state:'confirmed',archive_snapshot:{sourceKind:'coach',coachKind:'easy',startTime:'18:00',warmup:{durationSeconds:300},cooldown:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:3000}]}}}
const boards=[{start:'2026-11-23',activities:[row],manual:[]}]
const options={options:[],choices:[]}
const profile={observed_at:'2026-11-26T10:00:00Z',profile:{sport:'running',zones:[120,145,160,180,195]}}
const samples=Array.from({length:601},(_,i)=>({elapsed:i*6,hr:160}))
const candidate=recentEasyCandidates({today,boards,plans:[plan]})[0]
const exposure=compactPurposeExposure(candidate.activity,samples,145)
const data={today,boards,plans:[plan],evidence:[exposure]}
test('objective excess despite low RPE uses historic reference, not inferred LT1',()=>{
 assert.equal(priorGarminUpper([profile],date),145)
 assert.equal(priorGarminUpper([{...profile,observed_at:'2026-11-27T00:00:00Z'}],date),null)
 assert.equal(priorGarminUpper([{...profile,profile:{sport:'running',zones:[120,145,143,180,195]}}],date),null)
 assert.equal(compactPurposeExposure(candidate.activity,samples.slice(0,200),145),null)
 const feedback=recentPurposeFeedback(data)
 assert.equal(feedback.active,true)
 assert.equal(feedback.latest.objective,true)
 assert.match(feedback.latest.reason,/historisch protokollierte Garmin/)
 assert.equal(feedback.latest.until,'2026-11-29')
})
test('no matched plan, stale session, duplicate runs, missing measurements: no invented warning',()=>{
 assert.equal(recentPurposeFeedback({...data,evidence:[]}).active,false)
 assert.equal(recentPurposeFeedback({...data,plans:[]}).active,false)
 assert.equal(recentPurposeFeedback({...data,today:'2026-11-30'}).active,false)
 assert.equal(recentPurposeFeedback({...data,boards:[{...boards[0],activities:[row,{...row,activity_id:'456'}]}]}).active,false)
 assert.equal(recentPurposeFeedback({...data,evidence:[{...exposure,activityId:'wrong'}]}).active,false)
})
test('high subjective effort on a matched easy plan also warns without extra HR',()=>{
 const feedback=recentPurposeFeedback({...data,boards:[{...boards[0],activities:[{...row,rpe_raw:70}]}],evidence:[]})
 assert.equal(feedback.active,true)
 assert.equal(feedback.latest.objective,false)
})
test('same planning engine reacts, protects approved dates, does not force hard load',()=>{
 const metrics=Array.from({length:18},(_,i)=>({metric_date:new Date(Date.parse(today+'T12:00:00Z')-(17-i)*86400000).toISOString().slice(0,10),hrv_ms:50,resting_heart_rate:45,sleep_seconds:28800}))
 const input={today,health:{metrics,training:{runKm7:40,previousRunKm7:40,historyStatus:'complete',truncated:false}},boards,options,plans:{entries:[plan]},life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[]},runs:[],purposeEvidence:[exposure]}}
 const result=buildSevenDayCoach(input)
 assert.equal(result.purposeFeedback.active,true)
 assert.equal(result.attention,true)
 assert.equal(result.days[0].kind,'recovery')
 assert.equal(result.days[1].kind,'recovery')
 assert.equal(result.trainingMethod.qualityDay,null)
 assert.match(result.attentionText,/zu intensiv/)
 const saved={...plan,id:'future',training_date:today,title:'Bereits freigegeben'}
 const kept=buildSevenDayCoach({...input,plans:{entries:[plan,saved]}})
 assert.equal(kept.days[0].kind,'existing')
 assert.match(kept.days[0].reason,/zu intensiv/)
})

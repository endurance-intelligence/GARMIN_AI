import test from 'node:test'
import assert from 'node:assert/strict'
import {coachRecoveryAdvice} from '../src/lib/coachRecoveryAdvice.mjs'
import {recoveryStatus,sleepScoreStatus} from '../src/lib/recoveryStatus.mjs'
import {showArchivedLearning} from '../src/lib/learningVisibility.mjs'
const today='2026-10-18',shift=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const history=Array.from({length:15},(_,i)=>({metric_date:shift(i-14),sleep_seconds:8*3600,hrv_ms:65,resting_heart_rate:55,sleepDetail:{score:82}}))
test('rest guidance gives the actual reason, never echoes technical planner text',()=>{
 const rows=history.map(r=>r.metric_date===today?{...r,sleep_seconds:6.8*3600,hrv_ms:70,resting_heart_rate:58}:r)
 const plan={today,days:[{date:today,kind:'recovery',title:'Regeneration nach dem Wettkampf',reason:'Die Garmin-Aufzeichnung ist erkannt. TECHNICAL INTERNAL TEXT.'}],autoRaceRecovery:{status:'matched',daysSince:4,recoveryCaution:true}}
 const r=coachRecoveryAdvice({today,history:rows,plan})
 assert.equal(r.level,'rest')
 assert.equal(r.title,'Heute nicht auf Biegen und Brechen.')
 assert.match(r.advice,/Erholung nach dem Wettkampf/)
 assert.match(r.advice,/72 Minuten weniger geschlafen/)
 assert.doesNotMatch(r.advice,/Aufzeichnung|TECHNICAL|Barometer/)
 assert.match(r.tip,/Kein Zusatztraining/)
})
test('relative markers distinguish typical, mild, strong, missing and stale values',()=>{
 assert.equal(recoveryStatus('sleep_seconds',6.5*3600,8*3600).tone,'notice')
 assert.equal(recoveryStatus('hrv_ms',63,60).tone,'usual')
 assert.equal(recoveryStatus('hrv_ms',52,60).tone,'mild')
 assert.equal(recoveryStatus('hrv_ms',20,60).tone,'notice')
 assert.equal(recoveryStatus('resting_heart_rate',53,50).tone,'usual')
 assert.equal(recoveryStatus('stress_avg',30,24).tone,'mild')
 assert.equal(recoveryStatus('body_battery_max',90,80).tone,'higher')
 assert.equal(recoveryStatus('hrv_ms',60,60,{persistentLow:true}).tone,'notice')
 assert.equal(recoveryStatus('hrv_ms',60,null).tone,'unknown')
 assert.equal(recoveryStatus('hrv_ms',60,60,{fresh:false}).tone,'unknown')
 assert.equal(sleepScoreStatus(history,today).tone,'usual')
 assert.equal(sleepScoreStatus(history.slice(-2),today).tone,'unknown')
})
test('learning card requires two comparable weeks, 14 measured days, six unique runs and four ratings',()=>{
 const weeks=[{start:shift(-13),end:shift(-7),status:'comparable'},{start:shift(-20),end:shift(-14),status:'target-only'}]
 const review={weeks,caution:false}
 const boards=weeks.map((w,i)=>({start:w.start,activities:Array.from({length:3},(_,j)=>({activity_id:i*3+j,sport_type:'running',start_time_local:w.start+'T08:00:00',duration_s:1800,rpe_raw:j<2?40:null}))}))
 assert.equal(showArchivedLearning(review,history,boards,today),true)
 assert.equal(showArchivedLearning(review,history.slice(-13),boards,today),false)
 assert.equal(showArchivedLearning({...review,weeks:weeks.slice(0,1)},history,boards,today),false)
 assert.equal(showArchivedLearning(review,history,boards.slice(0,1),today),false)
 assert.equal(showArchivedLearning(review,history,boards.map(b=>({...b,activities:b.activities.map(a=>({...a,rpe_raw:null}))})),today),false)
 assert.equal(showArchivedLearning({...review,caution:true},[],[],today),true,'explain actual coaching caution')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {normalizeGarminSleep,sanitizeSleep,mergeSleepMetrics,publicRecoveryRow,completedDaySignal,sleepDetailEvidence,sleepComposition} from '../src/lib/recoverySleep.mjs'
import {coachRecoveryAdvice} from '../src/lib/coachRecoveryAdvice.mjs'
const today='2026-02-20',shift=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const nights=Array.from({length:16},(_,i)=>({metric_date:shift(i-16),sleep_seconds:8*3600,hrv_ms:60,resting_heart_rate:50,stress_avg:25,body_battery_max:90,sleepDetail:{score:80,awakeSeconds:600,sleepStress:20}}))
test('Garmin sleep normalization validates optional measured values; no raw payload leaks',()=>{
 const d=normalizeGarminSleep({deepSleepSeconds:3600,lightSleepSeconds:14400,remSleepSeconds:5400,awakeSleepSeconds:0,sleepScores:{overall:{value:83}},avgSleepStress:18,notes:'private'})
 assert.deepEqual(d,{deepSeconds:3600,lightSeconds:14400,remSeconds:5400,awakeSeconds:0,score:83,sleepStress:18})
 assert.deepEqual(normalizeGarminSleep({deepSleepSeconds:-1,lightSleepSeconds:null,remSleepSeconds:0,deviceRemCapable:false,sleepScores:{overall:{value:'80'}}}),null)
 const raw=mergeSleepMetrics({unrelated:'private'},d)
 assert.deepEqual(mergeSleepMetrics(raw,null),raw)
 assert.deepEqual(publicRecoveryRow({metric_date:today,raw_metrics:raw}),{metric_date:today,sleepDetail:d})
 assert.equal(sleepComposition(d).total,23400)
 assert.equal(sleepComposition({deepSeconds:0,remSeconds:3600}),null)
 assert.equal(sanitizeSleep({score:101}),null)
})
test('stress and battery compare only yesterday with a measured prior reference',()=>{
 const rows=[...nights.map(x=>x.metric_date===shift(-1)?{...x,stress_avg:45,body_battery_max:60}:x),{metric_date:today,stress_avg:100,body_battery_max:0}]
 assert.equal(completedDaySignal(rows,today,'stress_avg').delta,20)
 assert.equal(completedDaySignal(rows,today,'body_battery_max').delta,-30)
 assert.equal(completedDaySignal(rows.slice(-2),today,'stress_avg').delta,null)
 assert.equal(completedDaySignal(rows.filter(r=>r.metric_date!==shift(-1)),today,'stress_avg').value,null)
})
test('sleep quality is corroborating evidence, not independent REM warning or extra points',()=>{
 const current={metric_date:today,sleep_seconds:28800,hrv_ms:60,resting_heart_rate:50,sleepDetail:{score:50,awakeSeconds:3600,sleepStress:40}}
 const plan={today,days:[{date:today,kind:'easy',title:'Easy'}]}
 const r=coachRecoveryAdvice({today,history:[...nights,current],plan})
 assert.equal(r.level,'caution')
 assert.match(r.evidence,/Schlafscore/)
 assert.match(r.evidence,/Wachzeit/)
 assert.match(r.evidence,/Schlafstress/)
 assert.equal(sleepDetailEvidence([...nights,{...current,sleepDetail:{remSeconds:0}}],today).disrupted,false)
 assert.equal(coachRecoveryAdvice({today,history:[...nights,{...current,sleepDetail:{remSeconds:0}}],plan}).level,'balanced')
})
test('all three read and ingestion contracts preserve auth and private fields',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('supabase/functions/sync-garmin-health/index.ts'),/raw_metrics: mergeSleepMetrics/)
 for(const p of ['read-garmin-health','garmin-coach-archive']){
  const s=read('supabase/functions/'+p+'/index.ts')
  assert.match(s,/auth\.auth\.getUser/)
  assert.match(s,/email_confirmed_at/)
  assert.match(s,/\.map\(publicRecoveryRow\)/)
 }
 const ui=read('src/components/CoachGlance.tsx')
 assert.match(ui,/<CoachAvatar mood=/)
 assert.match(ui,/<RecoverySleepDetails/)
 assert.match(ui,/Gestern · abgeschlossener Tag/)
})

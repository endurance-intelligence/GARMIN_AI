import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeLongTermRecovery} from '../src/lib/longTermRecovery.mjs'
import {coachRecoveryAdvice} from '../src/lib/coachRecoveryAdvice.mjs'
import {emptyAthleteProfile,normalizeAthleteProfile,cycleAvailability} from '../src/lib/athleteProfile.mjs'
const today='2026-01-30'
const day=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const data=Array.from({length:30},(_,i)=>({metric_date:day(i-29),hrv_ms:i<16?60:25+(i%3),resting_heart_rate:55,sleep_seconds:8*3600,stress_avg:20,body_battery_max:90}))
test('persistent decline uses an earlier disjoint reference even when rolling median has adapted',()=>{
 const x=analyzeLongTermRecovery(data,today)
 assert.equal(x.hrv.reference,60)
 assert.equal(x.hrv.referenceCount,16)
 assert.equal(x.hrv.count14,14)
 assert.equal(x.severeLow,true)
 const r=coachRecoveryAdvice({today,history:data,plan:{today,days:[{date:today,kind:'easy',title:'Easy'}]}})
 assert.match(r.title,/Anhaltend/)
 assert.match(r.tip,/ärztlich/)
})
test('missing reference, one low outlier or sparse days are not prolonged suppression',()=>{
 assert.equal(analyzeLongTermRecovery(data.slice(-14),today).severeLow,false)
 assert.equal(analyzeLongTermRecovery(data.map((d,i)=>({...d,hrv_ms:i===29?25:60})),today).persistentLow,false)
 assert.equal(analyzeLongTermRecovery(data.filter((_,i)=>i<20||i===29),today).severeLow,false)
})
test('personal preferences require explicit values and cycle is opt-in',()=>{
 const p=emptyAthleteProfile()
 assert.equal(p.cycleEnabled,false)
 assert.equal(normalizeAthleteProfile(p),null)
 const ready={...p,sports:['running','rowing'],daysPerWeek:3,sessionMinutes:30,preferredDays:[1,3],goal:'fitness',level:'beginner'}
 assert.deepEqual(normalizeAthleteProfile(ready),ready)
 assert.equal(normalizeAthleteProfile({...ready,preferredDays:[1,2,3,4]}),null)
 assert.equal(normalizeAthleteProfile({...ready,sports:['unknown']}),null)
 assert.equal(normalizeAthleteProfile({...ready,cycleEnabled:'yes'}),null)
})
test('cycle probe exposes capability only; numeric phase mapping remains unverified',()=>{
 assert.equal(cycleAvailability({dayInCycle:12,currentPhase:2,notes:'synthetic sensitive fixture'}),'schema-review')
 assert.equal(cycleAvailability({}), 'unavailable')
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const api=read('supabase/functions/garmin-athlete-profile/index.ts')
 assert.match(api,/auth\.auth\.getUser/)
 assert.match(api,/profile\?\.cycleEnabled!==true/)
 assert.match(api,/periodichealth-service\/menstrualcycle\/summary/)
 assert.match(api,/status:cycleAvailability/)
 assert.doesNotMatch(api,/console\.log|console\.error/)
 const sql=read('supabase/migrations/20261127144554_garmin_athlete_onboarding_profile.sql')
 assert.match(sql,/enable row level security/)
 assert.match(sql,/from public, anon, authenticated/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {longTermWeekStarts} from '../src/lib/coachLongTerm.mjs'
import {analyzeThresholdIntensity,validateThresholdCalibration} from '../src/lib/coachThresholds.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-19'
const all=longTermWeekStarts(today,12)
const profile={tested_on:'2026-01-15',test_type:'lab_lactate',
 lt1_bpm:145,lt2_bpm:173}
const hist={144:3600,145:1200,172:600,173:600}
const week=(start,values=hist,rest={})=>({
 start,finish:'2026-11-16',readOnly:true,totalActivities:2,
 measuredActivities:2,skippedActivities:0,
 validSeconds:Object.values(values).reduce((a,b)=>a+b,0),
 measuredExpectedSeconds:6400,histogram:values,...rest
})
const records=(n=8)=>all.slice(0,n).map(x=>week(x))
const assess=(calibration=profile,weekRows=records(),weeks=8)=>
 analyzeThresholdIntensity({today,calibration,weekRows,weeks})

test('valid user-entered threshold and test source, no values inferred from device zones',()=>{
 const result=validateThresholdCalibration(profile,today)
 assert.equal(result.valid,true)
 assert.equal(result.isLab,true)
 assert.equal(result.isOld,false)
 assert.equal(validateThresholdCalibration({...profile,test_type:'field_test'},today).isLab,false)
 assert.equal(validateThresholdCalibration({...profile,tested_on:'2026-12-01'},today).valid,false)
 assert.equal(validateThresholdCalibration({...profile,tested_on:'2026-11-31'},today).valid,false)
 assert.equal(validateThresholdCalibration({...profile,lt1_bpm:180,lt2_bpm:182},today).valid,false)
 assert.equal(validateThresholdCalibration({...profile,test_type:'garmin_auto'},today).valid,false)
 assert.equal(validateThresholdCalibration({...profile,lt1_bpm:null},today).valid,false)
})
test('empty thresholds never calculate lab values or FIT time, only Garmin device UI remains',()=>{
 const r=assess(null)
 assert.equal(r.status,'no-calibration')
 assert.equal(r.comparable,false)
 assert.equal(r.blocks.length,0)
 assert.equal(r.lt1,null)
 assert.equal(r.lt2,null)
 assert.equal(r.readOnly,true)
})
test('three explicit threshold zones use real recorded HR seconds and exact boundary bpm',()=>{
 const r=assess()
 assert.equal(r.status,'ready')
 assert.equal(r.comparable,true)
 assert.equal(r.blocks.length,2)
 assert.equal(r.blocks[0].ready,true)
 assert.equal(r.blocks[0].measuredSeconds,24000)
 assert.deepEqual(r.blocks[0].seconds,[14400,7200,2400])
 assert.deepEqual(r.blocks[0].shares,[60,30,10])
 assert.deepEqual(r.changes,{low:0,middle:0,high:0})
 assert.equal(r.isLab,true)
 assert.equal(r.testedOn,'2026-01-15')
 assert.match(r.warning,/zeitlich hinterherlaufen/)
})
test('physiology threshold time is not retrospectively applied before the test date',()=>{
 const lastTest={...profile,tested_on:'2026-11-01'}
 const r=assess(lastTest)
 assert.equal(r.status,'incomplete')
 assert.equal(r.comparable,false)
 assert.match(r.blocks[0].reason,/vor dem angegebenen Schwellentest/)
 assert.match(r.blocks[1].reason,/vor dem angegebenen Schwellentest/)
 assert.equal(r.changes,null)
})
test('18-month-old threshold measurement does not justify a current physiological chart',()=>{
 const result=assess({...profile,tested_on:'2024-05-01'})
 assert.equal(result.status,'outdated')
 assert.equal(result.comparable,false)
 assert.equal(result.blocks.length,0)
 assert.match(result.warning,/18 Monate/)
})
test('12-week analysis adds historic third block but only compares last two',()=>{
 const rows=records(12)
 const result=assess(profile,rows,12)
 const simple=assess(profile,rows,8)
 assert.equal(result.status,'ready')
 assert.equal(result.blocks.length,3)
 assert.deepEqual(result.changes,simple.changes)
 assert.equal(result.blocks[2].ready,true)
 assert.equal(result.blocks[2].receivedWeeks,4)
})
test('different threshold-band distribution compares actual shares by percentage points',()=>{
 const low={120:4500,160:1200,180:300}
 const changed=records().map((row,i)=>i<4?week(row.start,low):row)
 const result=assess(profile,changed)
 assert.equal(result.comparable,true)
 assert.deepEqual(result.blocks[0].shares,[75,20,5])
 assert.deepEqual(result.changes,{low:15,middle:-10,high:-5})
})
test('one missing ISO-week prevents confident intensity comparison',()=>{
 const incomplete=assess(profile,records().slice(1))
 assert.equal(incomplete.status,'incomplete')
 assert.equal(incomplete.blocks[0].ready,false)
 assert.equal(incomplete.blocks[0].receivedWeeks,3)
 assert.equal(incomplete.changes,null)
})
test('too many missing FIT heart-rate activities block physiological classification',()=>{
 const partial=records().map((row,i)=>i<4?
  {...row,totalActivities:6,measuredActivities:2,skippedActivities:4}:row)
 const result=assess(profile,partial)
 assert.equal(result.comparable,false)
 assert.match(result.blocks[0].reason,/Zu viele Läufe/)
})
test('too little HR recording, too few activities, or fewer than three measured weeks are not comparable',()=>{
 const lowCoverage=records().map((r,i)=>i<4?
  {...r,measuredExpectedSeconds:12000}:r)
 assert.equal(assess(profile,lowCoverage).blocks[0].ready,false)
 const lowSessions=records().map((r,i)=>i<4?
  {...r,totalActivities:1,measuredActivities:1,skippedActivities:0}:r)
 assert.equal(assess(profile,lowSessions).blocks[0].ready,true)
 const tooFew=records().map((r,i)=>i<2?
  {...r,totalActivities:0,measuredActivities:0,skippedActivities:0,
   validSeconds:0,measuredExpectedSeconds:0,histogram:{}}:r)
 assert.equal(assess(profile,tooFew).comparable,false)
})
test('corrupt or duplicate weekly payloads do not contaminate clinical threshold percentages',()=>{
 const duplicate=assess(profile,[...records(),records()[0]])
 assert.equal(duplicate.blocks[0].receivedWeeks,4)
 assert.equal(duplicate.blocks[0].measuredSeconds,24000)
 const corrupt=records()
 corrupt[0]={...corrupt[0],validSeconds:100}
 const result=assess(profile,corrupt)
 assert.equal(result.comparable,false)
 assert.equal(result.blocks[0].receivedWeeks,3)
})
test('fractional Garmin FIT seconds are preserved and not treated as whole counts',()=>{
 const r=records()
 r[0]={...r[0],validSeconds:6000.5,
  histogram:{144:3600.5,145:1200,172:600,173:600}}
 const analysis=assess(profile,r)
 assert.equal(analysis.status,'ready')
 assert.equal(analysis.blocks[0].measuredSeconds,24000.5)
})
test('UI uses direct owner authenticated save and delete, no age/HRmax auto-calculated thresholds',()=>{
 const api=read('supabase/functions/garmin-threshold-calibration/index.ts')
 const form=read('src/components/CoachThresholdCalibration.tsx')
 const report=read('src/components/CoachThresholdReport.tsx')
 const card=read('src/components/CoachHrTimeCard.tsx')
 const core=read('src/lib/coachThresholds.mjs')
 const weekly=read('src/lib/coachSevenDay.mjs')
 assert.match(api,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.match(api,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(api,/!user\.email_confirmed_at/)
 assert.match(api,/input\.confirm!==true/)
 assert.match(api,/\.eq\('user_id',user\.id\)/)
 assert.match(api,/\.upsert\(row,\{onConflict:'user_id'\}\)/)
 assert.match(form,/Testwerte ausdrücklich speichern/)
 assert.match(form,/action:'delete',confirm:true/)
 assert.match(form,/setConfirmed\(false\)/)
 assert.match(report,/LT1 bis unter LT2/)
 assert.match(report,/keine automatische Änderung/)
 assert.match(card,/analyzeThresholdIntensity/)
 assert.match(card,/<CoachThresholdCalibration active=\{active&&expanded\}/)
 assert.doesNotMatch(core,/fetch\(|\.upsert\(|\.insert\(|createWorkout|postToGarmin/)
 assert.doesNotMatch(weekly,/analyzeThresholdIntensity/)
})

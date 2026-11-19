import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {screenEasyPaceRun} from '../supabase/functions/_shared/aerobic-pace.mjs'
import {analyzeAerobicEfficiency} from '../src/lib/coachAerobicEfficiency.mjs'
import {longTermWeekStarts} from '../src/lib/coachLongTerm.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-19'
const starts=longTermWeekStarts(today,12)
const profile={zone1Min:95,zones:[115,145,155,170,185]}
const fit=(count=3601,hr=132,speed=2.8)=>Array.from({length:count},(_,i)=>({
 elapsed:i,hr,speed
}))
const screen=(options={})=>screenEasyPaceRun({
 chunks:[fit()],durationS:3600,distanceM:10000,elevationGainM:45,
 rpeRaw:40,feelingRaw:75,...options
})
const makeRun=(date,speed=2.8,other={})=>({
 date,distanceBand:'8–12 km',gainMPerKm:4.5,rpe:4,
 validSeconds:3500,coveragePercent:97.2,speedCv:.045,
 bins:[{bpmFrom:130,bpmTo:134,seconds:1500,speedMps:speed}],...other
})
const week=(start,index=0,other={})=>({
 start,end:'2026-11-16',kind:'observed-pace-at-HR',readOnly:true,
 totalRunning:1,eligible:1,excluded:0,reasons:{},
 runs:[makeRun(start,index<4?2.8:2.7)],...other
})
const rows=starts.map((start,i)=>week(start,i))
const analyze=(list=rows,range=8,p=profile)=>analyzeAerobicEfficiency({
 today,weeks:range,weekRows:list,profile:p,
 goal:{race_name:'Heartbeat Ultra',phase:'taper'}
})
test('screening uses real FIT elapsed time and observed speed, not nominal GPS pace',()=>{
 const s=screen()
 assert.equal(s.qualified,true)
 assert.equal(s.distanceBand,'8–12 km')
 assert.equal(s.gainMPerKm,4.5)
 assert.equal(s.rpe,4)
 assert.equal(s.validSeconds,3600)
 assert.equal(s.coveragePercent,100)
 assert.deepEqual(s.bins,[{bpmFrom:130,bpmTo:134,seconds:3600,speedMps:2.8}])
})
test('FIT chunk boundaries preserve exact seconds without double counting',()=>{
 const p=fit()
 const split=screen({chunks:[p.slice(0,1900),p.slice(1900)]})
 assert.equal(split.validSeconds,screen().validSeconds)
 assert.deepEqual(split.bins,screen().bins)
})
test('a mismatched run duration, missing gain, hills, missing RPE or hard Garmin rating is excluded',()=>{
 for(const [change,reason] of [
  [{durationS:1000},'duration-or-distance'],
  [{distanceM:2000},'duration-or-distance'],
  [{elevationGainM:null},'terrain-unknown'],
  [{elevationGainM:200},'hilly'],
  [{rpeRaw:null},'rpe-missing'],
  [{rpeRaw:70},'hard-or-poor-feeling'],
  [{feelingRaw:25},'hard-or-poor-feeling'],
 ])assert.equal(screen(change).reason,reason,reason)
})
test('missing HR/speed and large timestamp gaps cannot fabricate a steady easy run',()=>{
 const sparse=fit().map((p,i)=>({...p,hr:i<1300?null:p.hr}))
 assert.equal(screen({chunks:[sparse]}).reason,'fit-coverage')
 const gaps=fit().map((p,i)=>({...p,elapsed:i<1900?i:i+900}))
 assert.equal(screen({chunks:[gaps]}).reason,'fit-coverage')
 const erratic=fit().map((p,i)=>({...p,speed:i%2?2.0:4.6}))
 assert.equal(screen({chunks:[erratic]}).reason,'uneven-speed')
})
test('FIT screening preserves fractional seconds and prevents accidental interpolation',()=>{
 const p=Array.from({length:7201},(_,i)=>({elapsed:i*.5,hr:125,speed:2.65}))
 const r=screen({chunks:[p]})
 assert.equal(r.qualified,true)
 assert.equal(r.validSeconds,3600)
 assert.equal(r.bins[0].seconds,3600)
 assert.equal(r.bins[0].bpmFrom,125)
})
test('eight real completed Garmin weeks produce a same-HR pace comparison with traceable run counts',()=>{
 const r=analyze()
 assert.equal(r.comparable,true)
 assert.equal(r.status,'measured')
 assert.equal(r.weeksLoaded,8)
 assert.equal(r.hrBand[0],130)
 assert.equal(r.hrBand[1],134)
 assert.equal(r.distanceBand,'8–12 km')
 assert.equal(r.recentRuns,4)
 assert.equal(r.previousRuns,4)
 assert.equal(r.previousSeconds,6000)
 assert.equal(r.recentSeconds,6000)
 assert.equal(r.earlierPaceSecKm,370.4)
 assert.equal(r.recentPaceSecKm,357.1)
 assert.equal(r.deltaSecKm,-13.2)
 assert.equal(r.speedChangePercent,3.7)
 assert.equal(r.phase,'taper')
 assert.equal(r.readOnly,true)
})
test('twelve weeks give the same latest four-vs-four comparison without future weeks',()=>{
 const a=analyze(rows,8),b=analyze(rows,12)
 assert.equal(b.weeksLoaded,12)
 assert.deepEqual(b.hrBand,a.hrBand)
 assert.equal(b.deltaSecKm,a.deltaSecKm)
 assert.equal(starts[0],'2026-11-09')
})
test('one missing weekly API response blocks comparisons rather than treating absence as zero',()=>{
 const r=analyze(rows.filter((_,i)=>i!==4))
 assert.equal(r.comparable,false)
 assert.equal(r.reason,'weeks-missing')
 assert.equal(r.earlierPaceSecKm,null)
 assert.equal(r.weeksLoaded,7)
})
test('without personal Garmin easy HR zone, no claim of aerobic comparison',()=>{
 assert.equal(analyze(rows,8,null).reason,'zones-missing')
 assert.equal(analyze(rows,8,{zone1Min:100,zones:[]}).reason,'zones-missing')
})
test('same distance group, equal low RPE and near-equal hills are mandatory',()=>{
 const far=rows.map((w,i)=>i<4?week(w.start,i,{
  runs:[makeRun(w.start,2.8,{distanceBand:'5–8 km'})]
 }):w)
 assert.equal(analyze(far).reason,'no-paired-runs')
 const uphill=rows.map((w,i)=>i<4?week(w.start,i,{
  runs:[makeRun(w.start,2.8,{gainMPerKm:10})]
 }):w)
 assert.equal(analyze(uphill).reason,'no-paired-runs')
 const stressed=rows.map((w,i)=>i<4?week(w.start,i,{
  runs:[makeRun(w.start,2.8,{rpe:5})]
 }):week(w.start,i,{runs:[makeRun(w.start,2.7,{rpe:3})]}))
 assert.equal(analyze(stressed).reason,'no-paired-runs')
})
test('the same exact 5-bpm HR band is required in both blocks',()=>{
 const different=rows.map((w,i)=>i<4?week(w.start,i,{
  runs:[makeRun(w.start,2.8,{bins:[{bpmFrom:135,bpmTo:139,seconds:1400,speedMps:2.8}]})]
 }):w)
 assert.equal(analyze(different).reason,'no-paired-runs')
})
test('two runs from one week are not treated as two independent weeks',()=>{
 const limited=rows.map((w,i)=>i<4?week(w.start,i,{
  totalRunning:i===0?2:0,eligible:i===0?2:0,
  runs:i===0?[makeRun(w.start),makeRun(w.start)]:[]
 }):w)
 const r=analyze(limited)
 assert.equal(r.comparable,false)
 assert.equal(r.reason,'no-paired-runs')
})
test('low signal coverage and fabricated client data are not considered valid weeks',()=>{
 const malformed=rows.map((w,i)=>i===2?{
  ...w,eligible:2
 }:w)
 assert.equal(analyze(malformed).reason,'weeks-missing')
 const badHr=rows.map((w,i)=>i===2?{
  ...w,runs:[makeRun(w.start,2.8,{coveragePercent:20})]
 }:w)
 assert.equal(analyze(badHr).reason,'weeks-missing')
})
test('read-only frontend loads only on expansion and uses owner session with no workout changes',()=>{
 const api=read('supabase/functions/read-garmin-easy-efficiency/index.ts')
 const view=read('src/components/CoachAerobicEfficiencyCard.tsx')
 const parent=read('src/components/CoachLongTermCard.tsx')
 const model=read('src/lib/coachAerobicEfficiency.mjs')
 assert.match(api,/auth\.auth\.getUser\(token\[1\]\)/)
 assert.match(api,/!user\.email_confirmed_at/)
 assert.match(api,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(api,/req\.method!=='GET'/)
 assert.match(api,/garmin_fit_record_chunks/)
 assert.match(api,/screenEasyPaceRun/)
 assert.match(api,/no raw FIT/i)
 assert.doesNotMatch(api,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/)
 assert.match(view,/if\(!active\|\|!opened\|\|!garminSupabase\)return/)
 assert.match(view,/read-garmin-easy-efficiency\?start=/)
 assert.match(view,/Promise\.allSettled/)
 assert.match(view,/useGarminHrProfile\(active&&opened\)/)
 assert.match(view,/kein nachgewiesener Fitnesszuwachs/)
 assert.match(parent,/<CoachAerobicEfficiencyCard today=\{today\} weeks=\{range\} active=\{active&&expanded\} goal=\{goal\}\/\>/)
 assert.doesNotMatch(model,/createWorkout|postToGarmin|\.insert\(|\.upsert\(/)
});

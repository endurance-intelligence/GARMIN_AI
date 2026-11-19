import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {longTermWeekStarts} from '../src/lib/coachLongTerm.mjs'
import {analyzeGarminIntensityTrend} from '../src/lib/coachIntensityTrend.mjs'
import {classifyGarminHrSeconds} from '../src/lib/coachHrTime.mjs'
import {sumRecordedHrSeconds} from '../supabase/functions/_shared/garmin-time-weighted.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-19'
const profile={zones:[110,130,150,170,190],zone1Min:70}
const starts=longTermWeekStarts(today,12)
const normal=[3600,1200,1200]
const high=[2700,900,2400]
const week=(start,groups=normal,extra={})=>({
 start,finish:'2026-11-16',totalActivities:2,measuredActivities:2,
 skippedActivities:0,validSeconds:groups.reduce((s,x)=>s+x,0),
 measuredExpectedSeconds:6400,
 histogram:{120:groups[0],140:groups[1],175:groups[2]},
 readOnly:true,...extra
})
const history=(count=8,modifier=(i)=>i<4?high:normal)=>
 starts.slice(0,count).map((s,i)=>week(s,modifier(i)))
const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',phase:'taper'}
const analyze=(rows=history(),n=8,chosen=goal)=>analyzeGarminIntensityTrend({
 today,weeks:n,weekRows:rows,profile,goal:chosen
})

test('eight completed weeks compare two 4-week blocks by actual recorded FIT seconds',()=>{
 const r=analyze()
 assert.equal(r.status,'ready')
 assert.equal(r.comparable,true)
 assert.equal(r.blocks.length,2)
 assert.equal(r.blocks[0].receivedWeeks,4)
 assert.equal(r.blocks[0].measuredWeeks,4)
 assert.equal(r.blocks[0].activities,8)
 assert.equal(r.blocks[0].measuredActivities,8)
 assert.equal(r.blocks[0].measuredSeconds,24000)
 assert.equal(r.blocks[1].measuredSeconds,24000)
 assert.equal(r.blocks[0].bands[0].seconds,10800)
 assert.equal(r.blocks[0].bands[1].seconds,3600)
 assert.equal(r.blocks[0].bands[2].seconds,9600)
 assert.deepEqual(r.changes,{low:-15,middle:-5,upper:20})
 assert.equal(r.trend,'more-upper')
 assert.equal(r.blocks[0].recordingCoverage,93.8)
 assert.equal(r.blocks[0].activityCoverage,100)
 assert.equal(r.readOnly,true)
})

test('historic third 4-week block shown in 12-week view but never contaminates latest comparison',()=>{
 const initial=analyze(history(8))
 const all=analyze(history(12,i=>i<4?high:i<8?normal:[4800,600,600]),12)
 assert.equal(all.status,'ready')
 assert.equal(all.blocks.length,3)
 assert.deepEqual(all.changes,initial.changes)
 assert.equal(all.blocks[2].receivedWeeks,4)
 assert.equal(all.blocks[2].bands[0].share,80)
 assert.equal(all.blocks[2].bands[2].share,10)
 const oldMissing=analyze(history(8),12)
 assert.equal(oldMissing.comparable,true)
 assert.equal(oldMissing.blocks[2].ready,false)
 assert.equal(oldMissing.blocks[2].receivedWeeks,0)
})

test('nearby Heartbeat goal is correctly linked to current Taper, not a recommendation to add intensity',()=>{
 const r=analyze()
 assert.equal(r.goal.name,'Heartbeat Ultra Fulda')
 assert.equal(r.goal.raceDate,'2026-11-21')
 assert.equal(r.goal.phase,'taper')
 assert.equal(r.goal.phaseLabel,'Tapering')
 assert.equal(r.goal.protected,true)
 assert.match(r.detail,/nicht Leistung oder Erholungsstatus/)
 assert.equal(r.readOnly,true)
})
test('goal can be absent or unknown without inserting a synthetic race or phase',()=>{
 assert.equal(analyze(history(),8,null).goal,null)
 const invalid=analyze(history(),8,{race_name:'X',race_date:'2026-11-31',phase:'base'})
 assert.equal(invalid.goal,null)
 const other=analyze(history(),8,{race_name:'Hermannslauf',
  race_date:'2027-04-25',phase:'specific'})
 assert.equal(other.goal.name,'Hermannslauf')
 assert.equal(other.goal.phaseLabel,'Wettkampfspezifisch')
 assert.equal(other.goal.protected,false)
})

test('one missing week in recent 4-week block prevents trend and invented zero-mileage percentages',()=>{
 const partial=analyze(history().slice(1))
 assert.equal(partial.comparable,false)
 assert.equal(partial.status,'incomplete')
 assert.equal(partial.changes,null)
 assert.equal(partial.trend,'unknown')
 assert.equal(partial.blocks[0].receivedWeeks,3)
 assert.equal(partial.blocks[0].ready,false)
 assert.match(partial.blocks[0].reason,/Woche fehlt/)
})

test('two FIT weeks missing but other weeks loaded cannot be extrapolated into a confident trend',()=>{
 const rows=history().filter((_,i)=>i>1)
 const r=analyze(rows)
 assert.equal(r.comparable,false)
 assert.equal(r.blocks[0].measuredWeeks,2)
 assert.equal(r.changes,null)
})

test('poor activity-level FIT coverage suppresses comparisons even when captured seconds look ample',()=>{
 const rows=history().map((r,i)=>i<4?{
  ...r,totalActivities:5,measuredActivities:2,skippedActivities:3
 }:r)
 const r=analyze(rows)
 assert.equal(r.comparable,false)
 assert.equal(r.blocks[0].activityCoverage,40)
 assert.match(r.blocks[0].reason,/zu großer Teil/)
})

test('too few measured sessions, even with valid returned weeks, suppresses comparison',()=>{
 const rows=history().map((r,i)=>i<4?{
  ...r,totalActivities:1,measuredActivities:1,skippedActivities:0
 }:r)
 const r=analyze(rows)
 assert.equal(r.comparable,true)
 assert.equal(r.blocks[0].measuredActivities,4)
 const tooFew=history().map((r,i)=>i<4&&i<2?{
  ...r,totalActivities:0,measuredActivities:0,skippedActivities:0,
  validSeconds:0,measuredExpectedSeconds:0,histogram:{}
 }:r)
 const x=analyze(tooFew)
 assert.equal(x.comparable,false)
 assert.match(x.blocks[0].reason,/drei Wochen/)
})

test('insufficient two-hour time threshold and recording coverage both independently gate comparison',()=>{
 const short=history().map((r,i)=>i<4?week(r.start,[200,100,100],
  {measuredExpectedSeconds:410}):r)
 const a=analyze(short)
 assert.equal(a.blocks[0].ready,false)
 assert.match(a.blocks[0].reason,/zwei Stunden/)
 const poor=history().map((r,i)=>i<4?{
  ...r,measuredExpectedSeconds:10000
 }:r)
 const b=analyze(poor)
 assert.equal(b.blocks[0].recordingCoverage,60)
 assert.equal(b.comparable,false)
 assert.match(b.blocks[0].reason,/Messzeit/)
})

test('missing or nonsequential individual Garmin HF zones cannot produce a comparable trend',()=>{
 const a=analyzeGarminIntensityTrend({today,weeks:8,weekRows:history(),profile:null,goal})
 assert.equal(a.comparable,false)
 assert.equal(a.changes,null)
 assert.equal(a.blocks[0].ready,false)
 assert.match(a.blocks[0].reason,/Laufzonen/)
 const b=analyzeGarminIntensityTrend({today,weeks:8,weekRows:history(),
  profile:{zones:[110,120,100,170,190],zone1Min:70}})
 assert.equal(b.comparable,false)
})

test('stable or minor HR-zone shifts are neutral, not falsely classified as overtraining',()=>{
 const r=analyze(history(8,()=>normal))
 assert.deepEqual(r.changes,{low:0,middle:0,upper:0})
 assert.equal(r.trend,'similar')
 assert.match(r.title,/ähnlich verteilt/)
 const small=analyze(history(8,i=>i<4?[3390,1290,1320]:normal))
 assert.equal(small.trend,'similar')
})

test('duplicate or malformed week payloads must not inflate or corrupt the comparison',()=>{
 const row=week(starts[0])
 const dupe=analyze([row,row,...history().slice(1)])
 assert.equal(dupe.comparable,true)
 assert.equal(dupe.blocks[0].receivedWeeks,4)
 const broken=analyze([{...row,histogram:{120:9999999}},...history().slice(1)])
 assert.equal(broken.comparable,false)
 const invalid=analyze([{...row,measuredActivities:3},...history().slice(1)])
 assert.equal(invalid.comparable,false)
})

test('fractional recorded FIT seconds are valid measurement time, not automatically discarded',()=>{
 const p=Array.from({length:250},(_,i)=>({elapsed:i*.5,hr:125}))
 const measured=sumRecordedHrSeconds([p],124.5)
 assert.equal(measured.eligible,false) // below minimum duration
 const more=Array.from({length:1001},(_,i)=>({elapsed:i*.5,hr:125}))
 const r=sumRecordedHrSeconds([more],500)
 assert.equal(r.eligible,true)
 assert.equal(r.validSeconds,500)
 const partial={...week(starts[0]),validSeconds:6000.5,
  histogram:{120:3600.5,140:1200,175:1200},measuredExpectedSeconds:6400}
 const from=classifyGarminHrSeconds([partial],profile)
 assert.equal(from.status,'measured')
 assert.equal(from.measuredSeconds,6000.5)
 const changed=analyze([partial,...history().slice(1)])
 assert.equal(changed.comparable,true)
})

test('no 80/20 physiological threshold or automatic workout changes in analysis or UI',()=>{
 const model=read('src/lib/coachIntensityTrend.mjs')
 const ui=read('src/components/CoachIntensityTrendPanel.tsx')
 const card=read('src/components/CoachHrTimeCard.tsx')
 const parent=read('src/components/CoachLongTermCard.tsx')
 const coach=read('src/lib/coachSevenDay.mjs')
 assert.match(model,/classifyGarminHrSeconds/)
 assert.match(model,/measuredWeeks<3/)
 assert.match(model,/activityCoverage<75/)
 assert.match(model,/recordingCoverage<75/)
 assert.match(model,/Math\.abs\(seconds-row.validSeconds\)/)
 assert.match(ui,/Keine physiologische 80\/20-Quote/)
 assert.match(ui,/Tapering: Frische für den Wettkampf/)
 assert.match(ui,/unvollständige/)
 assert.match(ui,/Aktuelle Phase/)
 assert.match(card,/phaseForRace\(goal.race_date,today\)/)
 assert.match(card,/<CoachIntensityTrendPanel data=\{intensityTrend\}\/\>/)
 assert.match(parent,/goal=\{goal\}/)
 assert.doesNotMatch(model,/fetch\(|\.insert\(|\.upsert\(|createWorkout|postToGarmin|thresholdFromZone2/)
 assert.doesNotMatch(ui,/onSave|onApprove|Trainingseinheit verlängern/)
 assert.doesNotMatch(coach,/coachIntensityTrend|intensityTrend/)
})

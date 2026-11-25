import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildTreadmillSession} from '../src/lib/treadmillTraining.mjs'
import {buildGoalProfile,buildGoalSupplement} from '../src/lib/goalTrainingFocus.mjs'
const today='2026-11-25',g={race_name:'Test',race_date:'2027-05-01',distance_km:65}
const profile=buildGoalProfile({today,goal:{goal:g},route:{raceName:g.race_name,raceDate:g.race_date,ascentM:1125}})
const eq=incline=>({available:['treadmill'],treadmillMaxInclinePct:incline})
test('hill session is bounded by open duration and confirmed equipment maximum',()=>{
 for(const cap of [2,2.5,4,6,40]){
  const r=buildTreadmillSession({equipment:eq(cap),profile,minutes:26,preferHills:true})
  assert.equal(r.kind,'treadmill-hike')
  assert.equal(r.minutes,26)
  assert.equal(r.segments.reduce((sum,s)=>sum+s.minutes,0),26)
  assert.ok(r.segments.every(s=>s.incline>=0&&s.incline<=Math.min(cap,4)))
  assert.match(r.intensity,/Sätze/)
 }
})
test('unknown incline or terrain stays flat, no peak introduction, no protected taper prescription',()=>{
 assert.equal(buildTreadmillSession({equipment:eq(null),profile,minutes:25,preferHills:true}).kind,'treadmill-run')
 assert.equal(buildTreadmillSession({equipment:eq(6),profile:{...profile,hills:false},minutes:25,preferHills:true}).kind,'treadmill-run')
 assert.equal(buildTreadmillSession({equipment:eq(6),profile:{...profile,daysUntil:15},minutes:25,preferHills:true}).kind,'treadmill-run')
 assert.equal(buildTreadmillSession({equipment:eq(6),profile:{...profile,daysUntil:5},minutes:25,preferHills:true}),null)
 assert.equal(buildTreadmillSession({equipment:null,profile,minutes:25}),null)
 assert.equal(buildTreadmillSession({equipment:eq(6),profile,minutes:15}),null)
})
const boards=[{start:'2026-11-16',activities:[{activity_id:1,start_time_local:'2026-11-20T09:00',sport_type:'running',duration_s:1800},{activity_id:2,start_time_local:'2026-11-22T09:00',sport_type:'running',duration_s:1800}],manual:[]},{start:'2026-11-23',activities:[{activity_id:3,start_time_local:'2026-11-23T09:00',sport_type:'running',duration_s:1800}],manual:[]}]
const day={date:today,kind:'easy',minutes:25,intensityIntent:'low',approvable:true}
test('only an open easy slot, never a protected day or existing choice; actual plan unmodified',()=>{
 const input={today,profile,days:[day],boards,equipment:eq(6)}
 const before=JSON.stringify(input)
 assert.equal(buildGoalSupplement(input).suggestion.kind,'treadmill-hike')
 assert.equal(JSON.stringify(input),before)
 assert.equal(buildGoalSupplement({...input,protectedPhase:true}).suggestion,null)
 assert.equal(buildGoalSupplement({...input,days:[{...day,decision:'accepted'}]}).suggestion,null)
 assert.equal(buildGoalSupplement({...input,days:[day,{date:'2026-11-26',kind:'existing'}]}).suggestion,null)
 assert.equal(buildGoalSupplement({...input,boards:boards.slice(1)}).suggestion,null)
})
test('same session rendered on Coach and Calendar; no writes or direct device controls',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/components/CoachDailyBrief.tsx'),/<SupplementSessionDetails suggestion={supplement}/)
 assert.match(read('src/pages/CalendarPage.tsx'),/<SupplementSessionDetails suggestion={daySupplement}/)
 assert.doesNotMatch(read('src/lib/treadmillTraining.mjs'),/fetch\(|\.insert\(|\.upsert\(|createWorkout|backward|rückwärts/i)
})

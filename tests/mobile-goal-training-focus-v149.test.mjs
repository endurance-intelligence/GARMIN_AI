import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {exactGoalRoute,buildGoalProfile,goalPhaseFocus,crossTrainingEvidence,buildGoalSupplement} from '../src/lib/goalTrainingFocus.mjs'
const today='2026-11-25',g={race_name:'Test',race_date:'2027-05-01',distance_km:65}
const profile=(distance=65,route=null)=>buildGoalProfile({today,goal:{goal:{...g,distance_km:distance}},route})
test('profiles follow confirmed distance and exact course identity, not name',()=>{
 assert.equal(profile(5).kind,'short')
 assert.equal(profile(21.1).kind,'half')
 assert.equal(profile(42.195).kind,'marathon')
 assert.equal(profile().kind,'ultra')
 const route=exactGoalRoute(g,[{event_title:g.race_name,race_date:g.race_date,details:{ascentM:1125}}])
 assert.equal(profile(65,route).hills,true)
 assert.equal(profile(65,{...route,raceName:'Other'}).ascentM,null)
 assert.equal(profile().ascentM,null)
 assert.equal(exactGoalRoute(g,[{event_title:'Other',race_date:g.race_date,details:{ascentM:3000}}]),null)
 assert.match(goalPhaseFocus(profile(65,route),'specific').focus,/Power Hiking/)
 assert.doesNotMatch(goalPhaseFocus(profile(),'specific').focus,/Power Hiking/)
 assert.match(goalPhaseFocus(profile(),'taper').complement,/Keine neuen/)
 assert.match(goalPhaseFocus(profile(),'build',{deload:true}).title,/Reize verarbeiten/)
})
const boards=[{start:'2026-11-16',activities:[],manual:[]},{start:'2026-11-23',activities:[],manual:[]}]
const day={date:today,kind:'mobility',minutes:20,approvable:true}
test('only existing open slot can get strength guidance; no extra activity or protected-day override',()=>{
 const p=profile(),input={today,profile:p,days:[day],boards,equipment:{available:['bodyweight'],treadmillMaxInclinePct:null}}
 const before=JSON.stringify(input)
 const r=buildGoalSupplement(input)
 assert.equal(r.suggestion.kind,'strength')
 assert.equal(r.suggestion.minutes,20)
 assert.equal(r.suggestion.mode,'existing-slot')
 assert.equal(JSON.stringify(input),before)
 assert.equal(buildGoalSupplement({...input,protectedPhase:true}).suggestion,null)
 assert.equal(buildGoalSupplement({...input,days:[{...day,decision:'accepted'}]}).suggestion,null)
 assert.equal(buildGoalSupplement({...input,days:[day,{date:'2026-11-26',kind:'race'}]}).suggestion,null)
 assert.equal(buildGoalSupplement({...input,boards:boards.slice(1)}).suggestion,null)
})
test('cross-training evidence counts manual and Garmin once, excludes future and detects recent football',()=>{
 const b=structuredClone(boards)
 b[1].activities=[{activity_id:1,start_time_local:today+'T10:00',sport_type:'strength_training',duration_s:1200},{activity_id:2,start_time_local:'2026-11-24T19:00',sport_type:'soccer',duration_s:3600}]
 b[1].manual=[{id:'a',session_date:today,kind:'strength',duration_minutes:20},{id:'b',session_date:'2026-11-26',kind:'rowing',duration_minutes:30}]
 const e=crossTrainingEvidence({today,boards:b})
 assert.equal(e.strengthDays,1);assert.equal(e.minutes,80);assert.equal(e.recentHard,true)
 assert.equal(buildGoalSupplement({today,profile:profile(),days:[day],boards:b}).suggestion,null)
})
test('roadmap and today consume same profile; route read optional and no publication',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/lib/coachSnapshot.ts'),/exactGoalRoute\(goal.goal,raceResearch.saved\)/)
 assert.match(read('src/lib/coachSevenDay.mjs'),/buildGoalSupplement/)
 assert.match(read('src/components/CoachLongTermPlan.tsx'),/goalPhaseFocus\(profile,week.phase/)
 assert.match(read('src/pages/CoachPage.tsx'),/goalRoute:sharedSnapshot.goalRoute/)
 assert.match(read('src/pages/CalendarPage.tsx'),/goalRoute:coachSnapshot.goalRoute/)
 assert.doesNotMatch(read('src/lib/goalTrainingFocus.mjs'),/fetch\(|\.insert\(|\.upsert\(|createWorkout/)
})

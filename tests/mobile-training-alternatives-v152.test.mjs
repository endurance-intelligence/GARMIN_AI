import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildGoalProfile,buildDailyTrainingAlternatives,trainingAlternativeForDate} from '../src/lib/goalTrainingFocus.mjs'
const today='2026-11-25',g={race_name:'Test',race_date:'2027-05-01',distance_km:65}
const profile=buildGoalProfile({today,goal:{goal:g},route:{raceName:g.race_name,raceDate:g.race_date,ascentM:1125}})
const boards=[{start:'2026-11-16',activities:[{activity_id:1,start_time_local:'2026-11-20T09:00',sport_type:'running',duration_s:1800},{activity_id:2,start_time_local:'2026-11-22T09:00',sport_type:'running',duration_s:1800}],manual:[]},{start:'2026-11-23',activities:[{activity_id:3,start_time_local:'2026-11-23T09:00',sport_type:'running',duration_s:1800}],manual:[]}]
const day={date:today,kind:'easy',title:'Lockerer Lauf',minutes:45,intensityIntent:'low',approvable:true}
const days=[day,{...day,date:'2026-11-27'},{...day,date:'2026-11-29',kind:'long'},{...day,date:'2026-11-30',kind:'recovery'}]
const input={today,profile,days,boards,equipment:{available:['treadmill'],treadmillMaxInclinePct:6}}
test('eligible easy days have separate optional variants; long runs and rest protected',()=>{
 const before=JSON.stringify(input),alts=buildDailyTrainingAlternatives(input)
 assert.deepEqual(alts.map(x=>x.date),['2026-11-25','2026-11-27'])
 assert.ok(alts.every(a=>a.kind==='treadmill-hike'&&a.minutes===30))
 assert.equal(JSON.stringify(input),before)
 assert.equal(buildDailyTrainingAlternatives({...input,protectedPhase:true}).length,0)
 assert.equal(buildDailyTrainingAlternatives({...input,equipment:null}).length,0)
 const p={days,alternatives:alts}
 assert.equal(trainingAlternativeForDate(p,today),alts[0])
 assert.equal(trainingAlternativeForDate({...p,days:[{...day,decision:'accepted'}]},today),null)
})
test('review presents a mutually exclusive choice and rechecks data before writing a draft',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const ui=read('src/components/CoachSevenDay.tsx')
 assert.match(ui,/type="radio" name="coach-variant"/)
 assert.match(ui,/if\(variant==='alternative'\)\{if\(alternative\)void acceptAlternative/)
 assert.match(ui,/const fresh=await loadCoachSnapshot/)
 assert.match(ui,/JSON.stringify\(next\)!==JSON.stringify\(choice\)/)
 assert.match(ui,/fresh.plans.entries.some/)
 assert.match(ui,/variantLock.current=true/)
 assert.match(ui,/action:'create',clientRequestId:requestId,date:day.date,title,sessionType:'event',sport,notes/)
 assert.match(ui,/result.state!=='draft'/)
 assert.match(read('src/pages/CoachPage.tsx'),/trainingAlternativeForDate\(dailyPlan,coachToday\)/)
 assert.match(read('src/pages/CalendarPage.tsx'),/trainingAlternativeForDate\(coachPlan,selected\)/)
})

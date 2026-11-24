import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {getTrainingGoalMode} from '../src/lib/trainingGoalMode.mjs'
import {buildLongTermCoachPlan} from '../src/lib/coachLongTermPlan.mjs'
const past={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',distance_km:112}
test('past race is not an active training goal but race day remains active',()=>{
 assert.equal(getTrainingGoalMode(past,'2026-11-24').mode,'choose')
 assert.equal(getTrainingGoalMode(past,'2026-11-21').mode,'race')
 assert.equal(getTrainingGoalMode({...past,maintenance_weekly_km:45},'2026-11-24').weeklyKm,45)
 assert.equal(getTrainingGoalMode({...past,maintenance_weekly_km:45,race_date:'2027-04-25'},'2026-11-24').mode,'race')
 assert.equal(getTrainingGoalMode({...past,maintenance_weekly_km:-1},'2026-11-24').mode,'choose')
})
test('maintenance respects reliable current base and recovery instead of forcing a volume quota',()=>{
 const goal={goal:{...past,maintenance_weekly_km:45}}
 const health={training:{runKm7:30,previousRunKm7:30,historyStatus:'complete'}}
 const after=buildLongTermCoachPlan({today:'2026-12-10',goal,health})
 assert.equal(after.hasGoal,false)
 assert.equal(after.weeks.length,4)
 assert.equal(after.weeks[0].targetKm.high,30)
 assert.equal(after.weeks[0].qualityOptions,0)
 const sick=buildLongTermCoachPlan({today:'2026-12-10',goal,health,life:{context:{illness_state:'sick'}}})
 assert.equal(sick.weeks[0].targetKm,null)
 const missing=buildLongTermCoachPlan({today:'2026-12-10',goal})
 assert.equal(missing.weeks[0].targetKm,null)
 const recovering=buildLongTermCoachPlan({today:'2026-11-24',goal,health})
 assert.ok(recovering.weeks.every(w=>w.targetKm===null))
})
test('edit and maintain actions are scoped to the signed-in owner and past goals cannot be promoted',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const api=read('supabase/functions/garmin-race-goals/index.ts')
 assert.match(api,/input\.action==='update'/)
 assert.match(api,/\.eq\('user_id',user\.id\)\.eq\('id',input\.id\)\.select\(fields\)/)
 assert.match(api,/chosen\.race_date<today/)
 const goal=read('supabase/functions/garmin-coach-goal/index.ts')
 assert.match(goal,/v\.action==='maintenance'&&v\.confirm===true/)
 assert.match(goal,/\.eq\('user_id',user\.id\)\.eq\('race_date',v\.expectedRaceDate\)/)
 assert.match(read('src/components/RaceGoalsPanel.tsx'),/action:editId\?'update':'add'/)
 assert.match(read('src/components/CoachGoalPanel.tsx'),/Neues Ziel verfolgen/)
 assert.match(read('src/components/CoachGoalPanel.tsx'),/Fit halten/)
})

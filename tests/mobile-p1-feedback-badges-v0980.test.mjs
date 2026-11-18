import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {evaluateWorkoutFeedback,latestWorkoutFeedback} from '../src/lib/postWorkoutFeedback.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-17'
const report=(x={})=>({activityId:'24725092836',activityDate:'2026-11-16',
 activityName:'ORC Track',reportedOn:today,rpe:9,legs:'heavy',
 symptoms:'none',feel:'harder',note:'Schwere Beine',...x})
const sample=(feedback=[],raceDate='2026-12-01')=>({
 today,health:{metrics:Array.from({length:18},(_,i)=>({
  metric_date:coachAddDays(today,i-17),hrv_ms:49,resting_heart_rate:43,sleep_seconds:27600
 })),training:{runKm7:30,previousRunKm7:31,historyStatus:'complete',truncated:false}},
 boards:[{activities:[],manual:[]}],options:{options:[],choices:[]},plans:{entries:[]},
 goal:{goal:{race_name:'Heartbeat Ultra Fulda',race_date:raceDate,distance_km:112}},
 life:{context:{illness_state:'well',return_started_on:null,blocked_periods:[],
  run_reviews:[],day_decisions:[],race_recovery_checks:[],
  post_workout_feedback:feedback},runs:[]}
})
test('organizer race logo is fetched from saved event, not fabricated by hardcoded name',()=>{
 const goal=read('src/components/CoachGoalPanel.tsx')
 const research=read('supabase/functions/garmin-race-research/index.ts')
 const css=read('src/styles/coach-goal.css')
 assert.match(research,/details,.*evidence|event_title,details,evidence/)
 assert.match(goal,/garmin-race-research/)
 assert.match(goal,/data\.saved\?\.find\(x=>x\.race_date===goal\.race_date\)/)
 assert.match(goal,/match\?\.details\?\.logoUrl/)
 assert.match(goal,/cg-goal-emblem/)
 assert.match(goal,/cg-goal-emblem-fallback/)
 assert.match(goal,/if\(compact\)return/)
 assert.match(css,/\.cg-goal-name\{display:flex/)
 assert.doesNotMatch(goal,/heartbeat-ultra-fulda\.svg/)
})
test('an athlete reports 90% effort and heavy legs: advice is conservative and not a fake score',()=>{
 const x=evaluateWorkoutFeedback(report())
 assert.equal(x.level,'high')
 assert.equal(x.avoidHard,true)
 assert.equal(x.preferRest,true)
 assert.match(x.message,/Erholung/)
 assert.equal(evaluateWorkoutFeedback(report({rpe:5,legs:'ok',feel:'as_expected'})).level,'ok')
 assert.equal(evaluateWorkoutFeedback(report({rpe:7,legs:'heavy'})).level,'caution')
 assert.equal(evaluateWorkoutFeedback(report({symptoms:'clear'})).level,'warning')
})
test('only a recent verified subjective entry affects next-day recommendations',()=>{
 const p=buildSevenDayCoach(sample([report()]))
 assert.equal(p.days[0].kind,'recovery')
 assert.match(p.days[0].title,/Erholung nach harter Einheit/)
 assert.match(p.days[0].reason,/9\/10/)
 assert.equal(p.days[0].approvable,false)
 assert.equal(p.days[1].kind,'recovery')
 assert.equal(p.days[2].kind,'easy','third day does not inherit a blanket week-long restriction')
 assert.ok(p.flags.some(x=>x.includes('persönliche Rückmeldung')))
 assert.equal(p.latestWorkoutFeedback,'24725092836')
 assert.equal(buildSevenDayCoach(sample()).latestWorkoutFeedback,null)
 const stale=report({activityDate:'2026-11-12'})
 assert.equal(latestWorkoutFeedback([stale],today),null)
 assert.notEqual(buildSevenDayCoach(sample([stale])).days[0].title,'Erholung nach harter Einheit')
})
test('reported clear pain blocks automatic run advice, existing calendar items are never overwritten',()=>{
 const injured=buildSevenDayCoach(sample([report({symptoms:'clear'})]))
 assert.equal(injured.days[0].kind,'illness')
 assert.equal(injured.days[0].approvable,false)
 const preplanned=sample([report()])
 preplanned.plans.entries=[{training_date:today,title:'Meine geplante Einheit',state:'draft',sport:'running'}]
 const result=buildSevenDayCoach(preplanned)
 assert.equal(result.days[0].kind,'existing')
 assert.match(result.days[0].reason,/Termin im Kalender prüfen/)
 const raceDay=buildSevenDayCoach(sample([report({activityDate:'2026-11-16'})],today))
 assert.equal(raceDay.days[0].kind,'race')
})
test('owner-only backend verifies activity identity and prevents client-invented training history',()=>{
 const endpoint=read('supabase/functions/garmin-coach-context/index.ts')
 const schema=read('supabase/migrations/20261117131500_coach_post_workout_feedback_v0980.sql')
 assert.match(endpoint,/input\.action==='record_workout_feedback'/)
 assert.match(endpoint,/auth\.auth\.getUser\(bearer\[1\]\)/)
 assert.match(endpoint,/user\.email_confirmed_at/)
 assert.match(endpoint,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(endpoint,/\.eq\('activity_id',activityId\)\.maybeSingle\(\)/)
 assert.match(endpoint,/activityDate<plusDays\(today,-28\)/)
 assert.match(endpoint,/Number\.isInteger\(rpe\)/)
 assert.match(endpoint,/note\.length>280/)
 assert.match(endpoint,/post_workout_feedback:\[\.\.\.row\.post_workout_feedback/)
 assert.match(schema,/jsonb_array_length\(post_workout_feedback\) <= 40/)
 assert.match(schema,/RLS remain unchanged/)
 assert.doesNotMatch(endpoint,/action==='record_workout_feedback'[\s\S]{0,1800}intervals.*publish/)
})
test('previous feedback data remains compatible, but Coach no longer requires duplicate input',()=>{
 const seven=read('src/components/CoachSevenDay.tsx')
 const auto=read('src/components/GarminFeedbackCard.tsx')
 const types=read('src/components/CoachLifeContext.tsx')
 assert.match(seven,/<GarminFeedbackCard snapshot=\{snapshot\} today=\{today\}/)
 assert.doesNotMatch(seven,/<PostWorkoutFeedbackCard|<FeedbackTrendCard/)
 assert.doesNotMatch(auto,/onSave\(|record_workout_feedback|<select|<textarea/)
 assert.match(auto,/Anstrengung/)
 assert.match(auto,/Gefühl danach/)
 assert.match(types,/post_workout_feedback/,'preserve historical database feedback')
 assert.match(seven,/garmin-ai-coach-changed/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {phaseForRace,suggestedGoal} from '../src/lib/coachGoal.ts'
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const race=src('src/pages/RacePage.tsx')
const goal=src('src/components/CoachGoalPanel.tsx')
const api=src('supabase/functions/garmin-coach-goal/index.ts')
const sql=src('supabase/migrations/20261111093000_garmin_coach_goal.sql')
const coach=src('src/pages/CoachPage.tsx')
const weather=src('src/components/FixedTrainingWeather.tsx')
const board=src('src/components/CalendarWeekBoard.tsx')
const calendar=src('src/pages/CalendarPage.tsx')
const options=src('src/components/WeeklyTrainingOptions.tsx')
const today=src('src/components/CoachTodayWeather.tsx')
const glance=src('src/components/CoachGlance.tsx')

test('previously known Fulda 112km, 15h is an UNSAVED proposal until confirmed',()=>{
 assert.equal(suggestedGoal.race_name,'Heartbeat Ultra Fulda')
 assert.equal(suggestedGoal.race_date,'2026-11-21')
 assert.equal(suggestedGoal.distance_km,112)
 assert.equal(suggestedGoal.target_hours,15)
 assert.match(goal,/NOCH NICHT GESPEICHERT/)
 assert.match(goal,/confirm:true/)
 assert.match(race,/<CoachGoalPanel active=\{active\}/)
 assert.match(coach,/<CoachGoalPanel active=\{active\} compact/)
})
test('phase is transparent and exact, including recovery and after-race state',()=>{
 const cases=[
  ['2026-11-11','taper',10],
  ['2026-11-20','taper',1],
  ['2026-11-21','race',0],
  ['2026-11-22','recovery',-1],
  ['2026-12-07','expired',-16],
  ['2026-10-30','specific',22]
 ]
 for(const [date,phase,days] of cases){
  const p=phaseForRace('2026-11-21',date)
  assert.equal(p.phase,phase,date)
  assert.equal(p.daysUntil,days,date)
 }
 assert.throws(()=>phaseForRace('2026-02-31','2026-01-01'))
})
test('goal persistence is owner-auth only, never changes Garmin/Intervals or scheduled workouts',()=>{
 assert.match(api,/auth\.auth\.getUser\(/)
 assert.match(api,/user\.email_confirmed_at/)
 assert.match(api,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(api,/v\.confirm!==true/)
 assert.match(api,/\.from\('garmin_coach_goals'\)/)
 assert.match(api,/trainingPlanChanged:false/)
 assert.match(api,/garminChanged:false/)
 assert.match(api,/intervalsChanged:false/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/revoke all .*anon,authenticated/)
 assert.doesNotMatch(api,/garmin-connect-snapshot|intervals\.icu\/api\/v1|garmin-cloud-worker/)
})
test('forecast follows actual start time at ORC location and weather is in both calendar and selected day',()=>{
 assert.match(weather,/hourAt\(report,date,Number\(time\.slice\(0,2\)\)\)/)
 assert.match(weather,/weatherLabel\(hour\.code\)/)
 assert.match(weather,/hour\.rainProbability/)
 assert.match(weather,/hour\.gust/)
 assert.match(board,/<FixedTrainingWeather active=\{active\} compact date=\{day\} time=\{option\.start_time\}/)
 assert.match(board,/latitude=\{option\.location_lat\} longitude=\{option\.location_lon\}/)
 assert.match(options,/selectedDate\?:string/)
 assert.match(options,/selectedDate\|\|row\.date===selectedDate/)
 assert.match(calendar,/selectedDate=\{selected\} compact\/>/)
 assert.doesNotMatch(calendar,/<WeatherPanel/)
})
test('Coach shows fixed 19:00 and 09:00 weather instead of a free best slot when booked',()=>{
 assert.match(today,/garmin-weekly-options/)
 assert.match(today,/slot\.start_time/)
 assert.match(today,/<FixedTrainingWeather active=\{active\}/)
 assert.match(coach,/<CoachTodayWeather active=\{active\}/)
 assert.doesNotMatch(coach,/<WeatherPanel/)
 assert.doesNotMatch(glance,/get\('garmin-connect-snapshot'/)
 assert.match(glance,/get\('garmin-weekly-options'/)
})

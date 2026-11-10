import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const get=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const migration=get('supabase/migrations/20261110160500_weekly_training_coach_options_v0925.sql')
const choices=get('supabase/migrations/20261110161500_weekly_coach_choices_v0925.sql')
const api=get('supabase/functions/garmin-weekly-options/index.ts')
const ui=get('src/components/WeeklyTrainingOptions.tsx')
const coach=get('src/pages/CoachPage.tsx')
const calendar=get('src/pages/CalendarPage.tsx')
test('weekly options are strictly recurring and never auto-booked',()=>{
 assert.match(migration,/create table if not exists public\.garmin_weekly_training_options/i)
 assert.match(migration,/optional boolean not null default true check \(optional\)/)
 assert.match(api,/autopublish:false/)
 assert.doesNotMatch(api,/garmin-cloud-worker|intervals\.icu\/api|create workout|scheduleWorkout\(/i)
})
test('four actual times and locations are configured in Europe/Berlin',()=>{
 for(const [code,weekday,time,place] of [
  ['football-mon',1,'19:00','Friedrichsdorf, Gütersloh'],
  ['orc-track-tue',2,'19:00','Oerlinghausen'],
  ['orc-run-wed',3,'19:00','Oerlinghausen'],
  ['orc-track-sat',6,'09:00','Oerlinghausen']
 ]) {
  assert.ok(migration.includes("('"+code+"',"+weekday+",'"+time+"'"),code+' time')
  assert.ok(migration.includes("'"+place+"'"),place)
 }
 assert.match(migration,/Europe\/Berlin/)
 assert.match(choices,/51\.9604,location_lon=8\.6639/)
})
test('individual week decisions are owner-only and never publish to Intervals.icu',()=>{
 assert.match(choices,/choice in \('selected','skipped'\)/)
 assert.match(choices,/primary key \(training_date, option_code\)/)
 assert.match(api,/auth\.auth\.getUser\(/)
 assert.match(api,/user\.email.*owner/)
 assert.match(api,/garminChanged:false,intervalsChanged:false/)
 assert.match(api,/isoWeekday\(row\.date\)!==option\.weekday/)
})
test('weather is sampled at the true start hour for each chosen reference place',()=>{
 assert.match(ui,/getWeather\(place\)/)
 assert.match(ui,/hourAt\(report,date,Number\(option\.start_time\.slice\(0,2\)\)\)/)
 assert.match(ui,/hour\.rainProbability/)
 assert.match(ui,/hour\.gust/)
 assert.match(ui,/noch keine Stundenprognose/)
})
test('Coach and Calendar both see weekly options',()=>{
 assert.match(coach,/<WeeklyTrainingOptions active=\{active\}/)
 assert.match(calendar,/<WeeklyTrainingOptions active=\{active\}/)
 assert.match(ui,/option\.location_label/)
 assert.match(ui,/aria-pressed=\{choice==='selected'\}/)
 assert.match(ui,/Auslassen/)
})

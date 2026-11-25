import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {estimateRaceStrategy} from '../src/lib/raceStrategyMath.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('Goals appears in desktop and mobile nav with its own persistent route',()=>{
 const app=read('src/App.tsx'),type=read('src/navigation.ts')
 const nav=read('src/styles/navigation-goals.css')
 assert.match(type,/'home' \| 'goals' \| 'calendar'/)
 assert.match(app,/\{id:'goals',name:'Goals',icon:'target',mobile:'Goals'\}/)
 assert.match(app,/<GoalsPage active=\{page==='goals'\} onGo=\{go\}/)
 assert.ok(app.includes("(['home','goals','calendar','training','race'"))
 assert.match(nav,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/)
 assert.match(nav,/safe-area-inset-left/)
 assert.match(nav,/@media\(max-width:360px\)/)
})
test('Goals exclusively owns goal edits, other goals and long-term training blocks',()=>{
 const app=read('src/App.tsx'),page=read('src/pages/GoalsPage.tsx'),
  race=read('src/pages/RacePage.tsx'),coach=read('src/pages/CoachPage.tsx'),
  seven=read('src/components/CoachSevenDay.tsx')
 assert.match(page,/<CoachGoalPanel key=\{'primary-'\+revision\} active=\{active\}/)
 assert.match(page,/<RaceGoalsPanel key=\{'portfolio-'\+revision\} active=\{active\}/)
 assert.match(page,/<CoachLongTermPlan today=\{berlinDateToday\(\)\} snapshot=\{snapshot\}/)
 assert.match(page,/loadCoachSnapshot\(/)
 assert.match(page,/onPrimaryChange=\{changed\}/)
 assert.match(coach,/onGoals=\{\(\)=>onGo\('goals'\)\}/)
 assert.match(page,/onForecastOpen=\{onOpenRaceWeather\}/)
 assert.doesNotMatch(seven,/CoachLongTermPlan/)
 assert.doesNotMatch(race,/<CoachGoalPanel|<RaceGoalsPanel|<CoachLongTermPlan/)
 assert.match(app,/<GoalsPage/)
})
test('Race Prep exclusively owns event-day dossier, forecast, route and strategy',()=>{
 const race=read('src/pages/RacePage.tsx'),app=read('src/App.tsx')
 assert.match(race,/<RaceStrategyCard active=\{active\} forecast=\{raceForecast\} onCoach=\{\(\)=>onGo\('home'\)\}/)
 assert.match(race,/<RaceEventDossier active=\{active\}/)
 assert.match(race,/<RaceForecastCompact active=\{active\}/)
 assert.match(race,/<RaceRouteViewer active=\{active\}/)
 assert.match(race,/onGo\('goals'\)/)
 assert.doesNotMatch(race,/Wie der Coach planen soll|Ziel wird gespeichert|<RaceGoalsPanel|<RaceEventResearch/)
 assert.match(app,/function openRaceWeather\(\)\{/)
 assert.match(race,/race-detailed-forecast/)
})
test('actual athlete entered six-km loops, stops and long breaks yield explainable duration',()=>{
 const estimate=estimateRaceStrategy({
  distanceKm:112,courseMode:'laps',loopKm:6,movingMinutes:42,
  regularPauseMinutes:3,longStopEvery:3,longStopMinutes:10,paceSeconds:null
 })
 assert.ok(estimate)
 assert.equal(estimate.rounds,19)
 assert.equal(estimate.normalStops,18)
 assert.equal(estimate.extraStops,6)
 assert.equal(estimate.movingMinutes,784)
 assert.equal(estimate.breakMinutes,114)
 assert.equal(estimate.totalMinutes,898)
 assert.equal(estimate.formattedTotal,'14h 58m')
})
test('point-to-point pacing is computed only from entered min/km and distance',()=>{
 const estimate=estimateRaceStrategy({
  distanceKm:31.1,courseMode:'point_to_point',loopKm:null,movingMinutes:null,
  regularPauseMinutes:null,longStopEvery:null,longStopMinutes:null,paceSeconds:360
 })
 assert.ok(estimate)
 assert.equal(estimate.totalMinutes,187)
 assert.equal(estimate.rounds,null)
 assert.equal(estimate.breakMinutes,0)
 assert.equal(estimateRaceStrategy({distanceKm:112,courseMode:'laps',loopKm:null,
  movingMinutes:null,regularPauseMinutes:null,longStopEvery:null,
  longStopMinutes:null,paceSeconds:null}),null)
})
test('Race Prep saves per-race notes to Supabase, never local-only or Garmin',()=>{
 const ui=read('src/components/RaceStrategyCard.tsx')
 const sql=read('supabase/migrations/20261117134800_garmin_race_strategy_v0984.sql')
 assert.match(ui,/\.from\('garmin_race_strategy'\)/)
 assert.match(ui,/\.upsert\(payload,\{onConflict:'user_id,race_date,race_name'\}\)/)
 assert.match(ui,/\.select\('race_date'\)\.single\(\)/)
 assert.match(ui,/race_name:goal\.race_name/)
 assert.match(ui,/user_id:session\.user\.id/)
 assert.match(ui,/loadedKey\.current/)
 assert.match(ui,/<details className="rsp-details">/)
 assert.doesNotMatch(ui,/Die ausführlichen Daten bleiben für dich und deine Crew einklappbar/)
 assert.match(ui,/course_mode:draft\.courseMode/)
 assert.match(ui,/carbs_g_per_hour/)
 assert.match(ui,/fluid_ml_per_hour/)
 assert.match(ui,/sodium_mg_per_hour/)
 assert.match(ui,/long_stop_every/)
 assert.match(ui,/Keine automatischen Trainings- oder Garmin-Änderungen/)
 assert.doesNotMatch(ui,/service_role|publishWorkout|postToGarmin|insertWorkout/)
 assert.match(sql,/enable row level security/)
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/)
 assert.match(sql,/for update to authenticated using/)
 assert.match(sql,/with check \(user_id=\(select auth\.uid\(\)\)\)/)
 assert.match(sql,/revoke all on public\.garmin_race_strategy from anon/)
})

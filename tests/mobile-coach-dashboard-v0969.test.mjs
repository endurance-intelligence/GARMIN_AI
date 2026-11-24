import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {coachTodayChoice} from '../src/lib/coachTodayChoice.mjs'
import {recoveryMetricMeaning,recoveryDashboardMeaning} from '../src/lib/recoveryMeaning.mjs'
import {interpretRecovery} from '../src/lib/recoveryComparison.ts'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const day='2026-11-16',weekday=1
const foot={code:'football',weekday:1,title:'Fußball',start_time:'19:00',location_label:'Friedrichsdorf, Gütersloh',enabled:true}
test('a saved skip on Monday NEVER appears as training still open',()=>{
 const selected=[{training_date:day,option_code:'football',choice:'skipped'}]
 const s=coachTodayChoice([foot],selected,[],day,weekday)
 assert.equal(s.state,'skipped')
 assert.equal(s.skipped,true)
 assert.equal(s.workout,null)
 assert.equal(s.option,null)
 assert.match(s.skippedTitle,/Fußball/)
 const open=coachTodayChoice([foot],[],[],day,weekday)
 assert.equal(open.state,'optional')
 assert.equal(open.skipped,false)
 const accepted=coachTodayChoice([foot],[{...selected[0],choice:'selected'}],[],day,weekday)
 assert.equal(accepted.state,'selected')
 assert.equal(accepted.workout.title,'Fußball')
})
test('a real approved workout wins over a skipped voluntary group invitation',()=>{
 const skip=[{training_date:day,option_code:'football',choice:'skipped'}]
 const p=coachTodayChoice([foot],skip,[{training_date:day,title:'Eigener Lauf',state:'pending'}],day,weekday)
 assert.equal(p.state,'planned')
 assert.equal(p.plan.title,'Eigener Lauf')
 const free=coachTodayChoice([],[],[],day,weekday)
 assert.equal(free.state,'free')
 assert.equal(free.skipped,false)
})
test('recovery statements explain measured 7h46, 39ms HRV, 43 bpm individually',()=>{
 const report={metrics:[
  {metric:'sleep_seconds',latest:7*3600+46*60,median:7*3600+52*60,difference:-6*60,sampleCount:12},
  {metric:'hrv_ms',latest:39,median:51,difference:-12,sampleCount:12},
  {metric:'resting_heart_rate',latest:43,median:44,difference:-1,sampleCount:12}
 ]}
 assert.match(recoveryMetricMeaning(report.metrics[0]),/ungefähr so lange geschlafen wie sonst/)
 assert.match(recoveryMetricMeaning(report.metrics[1]),/HRV ist niedriger als sonst/)
 assert.match(recoveryMetricMeaning(report.metrics[2]),/Ruhepuls ist ungefähr so wie sonst/)
 const narrative=recoveryDashboardMeaning(report)
 assert.match(narrative,/HRV ist heute niedriger als sonst/)
 assert.match(narrative,/wie du dich fühlst/)
 assert.doesNotMatch(narrative,/trainingsbereit|freigegeben/i)
 assert.match(recoveryMetricMeaning({metric:'hrv_ms',latest:null,median:null,difference:null}),/Für heute fehlt noch ein Messwert/)
})
test('a daily skipped choice updates Coach and removes the wrong fixed weather forecast',()=>{
 const glance=read('src/components/CoachGlance.tsx')
 const weather=read('src/components/CoachTodayWeather.tsx')
 const options=read('src/components/WeeklyTrainingOptions.tsx')
 assert.match(glance,/coachTodayChoice\(rows\|\|\[\],choices\|\|\[\],planRows\|\|\[\],date,weekday,todayActivities,todayManual\)/)
 assert.match(glance,/Heute trainingsfrei · bewusst ausgelassen/)
 assert.match(glance,/!view\.skipped&&!view\.completedCount&&children/)
 assert.match(weather,/if\(skipped\)return null/)
 assert.match(weather,/const selected=todaySlots\.filter/)
 assert.match(weather,/const open=todaySlots\.filter/)
 assert.match(options,/garmin-ai-weekly-choice-changed/)
 assert.match(glance,/garmin-ai-weekly-choice-changed/)
 assert.match(weather,/garmin-ai-weekly-choice-changed/)
 assert.doesNotMatch(glance,/Heute noch offen/)
})
test('coach today leads the dashboard; next goal stays compact with future weather',()=>{
 const page=read('src/pages/CoachPage.tsx')
 const goal=read('src/components/CoachGoalPanel.tsx')
 const weather=read('src/components/CoachRaceWeatherMini.tsx')
 const css=read('src/styles/coach-goal.css')
 assert.ok(page.indexOf('<CoachDailyBrief brief={dailyBrief}')<page.indexOf('<CoachGoalPanel active={active} compact'))
 assert.ok(page.indexOf('<CoachGoalPanel active={active} compact')<page.indexOf('<CoachGlance active={active}'))
 assert.match(goal,/if\(compact\)return <section className=\{'cg-root cg-compact cg-home-hero'/)
 assert.match(goal,/!goalIsPast&&<CoachRaceWeatherMini active=\{active\} goal=\{current\} onOpenDetails=\{onForecastOpen\}\/>/)
 assert.match(goal,/Ziel bearbeiten/)
 assert.match(goal,/Ziel & Trainingsphase bearbeiten/)
 assert.match(weather,/raceForecastStatus/)
 assert.match(weather,/hours\.every\(\(h,i\)=>h\.epoch===hours\[0\]\.epoch\+i\*3600\)/)
 assert.match(weather,/Prognose, keine Gewissheit/)
 assert.match(css,/\.cg-root\.cg-home-hero/)
 assert.match(css,/@media\(max-width:830px\)/)
})
test('morning check explains metrics while keeping the existing Garmin-only charts',()=>{
 const glance=read('src/components/CoachGlance.tsx')
 const css=read('src/styles/coach-glance.css')
 assert.match(glance,/recoveryDashboardMeaning\(comparison\)/)
 assert.match(glance,/recoveryMetricMeaning\(entry\.row\)/)
 assert.match(glance,/<RecoverySparkline/)
 assert.match(glance,/recoveryNarrative\(comparison\)/)
 assert.match(css,/\.co-recovery-reading/)
 assert.match(css,/\.co-trend-meaning/)
})

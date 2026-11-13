import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const calendar=read('src/pages/CalendarPage.tsx')
const board=read('src/components/CalendarWeekBoard.tsx')
const coach=read('src/components/CoachSevenDay.tsx')
const source=read('src/lib/coachSnapshot.ts')
const app=read('src/App.tsx')
test('Coach and calendar load exactly the same verified 7-day data and same recommendation engine',()=>{
 assert.match(coach,/loadCoachSnapshot\(session,today,controller\.signal\)/)
 assert.match(calendar,/loadCoachSnapshot\(session,today,controller\.signal,start\)/)
 assert.match(coach,/buildSevenDayCoach\(/)
 assert.match(calendar,/buildSevenDayCoach\(/)
 for(const key of ['read-garmin-health','garmin-weekly-options','garmin-training-plan',
  'garmin-coach-goal','garmin-coach-context','garmin-week-board'])
  assert.ok(source.includes(key),'missing '+key)
 assert.match(source,/boards\.every\(board=>Array\.isArray\(board\.activities\)/)
 assert.match(source,/!Array\.isArray\(plans\.entries\)/)
})
test('Seven-day Coach hints are VISIBLE in calendar but not silently scheduled',()=>{
 assert.match(calendar,/coachDays=\{coachPlan\?\.days\|\|\[\]\}/)
 assert.match(board,/coachDays\?:CoachDay\[\]/)
 assert.match(board,/hwb-card is-coach/)
 assert.match(board,/COACH \/ VORSCHLAG/)
 assert.match(board,/noch nicht eingetragen/)
 assert.match(board,/!local\.length&&!acts\.length&&!manual\.length/)
 assert.match(board,/!\['existing','completed','chosen','option'\]\.includes\(candidate\.kind\)/)
 assert.match(calendar,/Coach-Empfehlung für diesen Kalendertag/)
 assert.match(calendar,/Noch nicht gespeichert · freiwillig/)
 assert.match(calendar,/coachPreview\.reason/)
 assert.match(calendar,/!coachPreview&&!coachLoading&&<div className="hc-empty"/)
})
test('single calendar day allows one explicit draft, then manual approval, then explicit Intervals publish',()=>{
 assert.match(calendar,/Vorschlag übernehmen/)
 assert.match(calendar,/Ja, als Entwurf übernehmen/)
 assert.match(calendar,/action:'create_coach_workout'/)
 assert.match(calendar,/action:'approve'/)
 assert.match(calendar,/action:'publish'/)
 assert.match(calendar,/setEligiblePlanIds\(old=>old\.includes\(newPlan\.id\)/)
 assert.match(calendar,/1 · Entwurf/)
 assert.match(calendar,/2 · Freigabe/)
 assert.match(calendar,/3 · Intervals\.icu/)
 assert.match(calendar,/intervalsConfirmed/)
 assert.doesNotMatch(calendar,/create_coach_workout[\s\S]{0,350}action:'publish'/)
 assert.match(calendar,/if\(plans\.some\(p=>p\.training_date===day\.date/)
})
test('mobile cards and direct navigation focus the exact day for continuation',()=>{
 const coachPage=read('src/pages/CoachPage.tsx')
 const style=read('src/styles/horizon-calendar.css')
 assert.match(coach,/onCalendar\(savedDay\)/)
 assert.match(coach,/Im Kalender weiter/)
 assert.match(app,/setCalendarFocus\(prev=>\(\{date,token:/)
 assert.match(app,/focus=\{calendarFocus\}/)
 assert.match(coachPage,/onCalendar=\{onOpenCalendar\}/)
 assert.match(calendar,/lastFocusToken\.current===focus\.token/)
 assert.match(calendar,/setWeek\(targetWeek\);setSelected\(focus\.date\)/)
 assert.match(style,/\.hc-coach-proposal\{/)
 assert.match(style,/\.hc-coach-confirm select\{/)
 assert.match(style,/min-height:44px/)
 assert.match(style,/@media\(max-width:610px\)/)
})
test('No empty daily ORC box for a day without group option, mobility remains strength',()=>{
 const options=read('src/components/WeeklyTrainingOptions.tsx')
 assert.match(options,/if\(compact&&selectedDate&&!loading&&!error&&visibleRows\.length===0\)return null/)
 assert.match(coach,/day\.kind==='mobility'\?'strength':day\.sport/)
 assert.match(calendar,/day\.kind==='mobility'\?'strength':day\.sport/)
 assert.match(calendar,/Keine Trainingsvorgaben geschätzt/)
})
test('Coach engine keeps the unsaved suggestion distinct from an existing approved plan',()=>{
 const metrics=Array.from({length:18},(_,i)=>({metric_date:coachAddDays('2026-11-12',i-17),
  hrv_ms:48,resting_heart_rate:42,sleep_seconds:7.5*3600}))
 const data={today:'2026-11-12',
  health:{metrics,training:{runKm7:40,previousRunKm7:38,historyStatus:'complete',truncated:false}},
  boards:[{activities:[],manual:[]}],
  options:{options:[{code:'track',weekday:6,enabled:true,title:'ORC Track'}],choices:[]},
  plans:{entries:[]},goal:{goal:{race_date:'2026-11-21',race_name:'Heartbeat Ultra Fulda'}},
  life:{context:{illness_state:'well',return_started_on:null,blocked_periods:[],run_reviews:[]},runs:[]}
 }
 const initial=buildSevenDayCoach(data)
 assert.equal(initial.days.length,7)
 const offered=initial.days.find(d=>d.approvable)
 assert.ok(offered)
 data.plans.entries=[{training_date:offered.date,state:'draft',title:offered.title}]
 const again=buildSevenDayCoach(data)
 assert.equal(again.days.find(x=>x.date===offered.date)?.kind,'existing')
 assert.equal(again.days.find(x=>x.date===offered.date)?.approvable,false)
})

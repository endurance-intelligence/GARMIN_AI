import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {coachTodayChoice} from '../src/lib/coachTodayChoice.mjs'
import {recoveryWeekTrend} from '../src/lib/recoveryWeekTrend.mjs'
import {coachAddDays,buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
import {selectCoachDecision} from '../src/lib/coachDecision.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const date='2026-11-16'
const football={code:'football-mon',weekday:1,title:'Fußball',enabled:true}
const skipped=[{training_date:date,option_code:'football-mon',choice:'skipped'}]
const stabi={start_time_local:date+' 10:24:25',activity_name:'Stabi & Mobility',
 sport_type:'mobility',duration_s:1986}
test('today combines a SKIPPED football invitation and a completed 33-minute Garmin mobility session',()=>{
 const s=coachTodayChoice([football],skipped,[],date,1,[stabi],[])
 assert.equal(s.state,'completed')
 assert.equal(s.skipped,true)
 assert.equal(s.completed.length,1)
 assert.match(s.doneLabel,/Stabi & Mobility · 33 Min\./)
 assert.match(s.skippedTitle,/Fußball/)
 const dup=coachTodayChoice([football],skipped,[],date,1,[stabi],
  [{session_date:date,kind:'mobility',duration_minutes:33,title:'Stabilitätstraining'}])
 assert.equal(dup.completed.length,1,'manually synced Stabi must not be double counted')
 const different=coachTodayChoice([football],skipped,[],date,1,[stabi],
  [{session_date:date,kind:'rowing',duration_minutes:25}])
 assert.equal(different.completed.length,2)
})
test('the previous seven-day recovery trend is stable even if latest HRV is individually low',()=>{
 const hrv=[49,41,49,58,55,47,48,51,56,39,51,49,52,45]
 const raw=Array.from({length:14},(_,i)=>({
  metric_date:coachAddDays(date,-13+i),hrv_ms:hrv[i],
  resting_heart_rate:44,sleep_seconds:7*3600+50*60
 }))
 const t=recoveryWeekTrend(raw,date)
 assert.ok(t)
 assert.match(t.summary,/ähnlich wie letzte Woche/)
 assert.equal(t.hrv.sampleCurrent,7)
 assert.equal(t.hrv.samplePrevious,7)
 assert.equal(recoveryWeekTrend([],date),null)
})
test('the real Coach decision shows selected/optional group events instead of a meaningless draft label',()=>{
 const plan={today:'2026-11-17',days:[{
  date:'2026-11-17',kind:'easy',title:'30 Min. locker statt Intervallen',
  minutes:30,reason:'Taper vor dem Wettkampf.',approvable:true
 }],flags:['Garmin: 23,2 km Laufumfang in 7 Tagen','Wettkampfziel Heartbeat Ultra Fulda am 2026-11-21'],
 signals:[],attentionText:''}
 const source={options:[{code:'orc-track-tue',title:'ORC Track',weekday:2,enabled:true}],
 choices:[],lastRun:{activity_name:'ORC Track - 5 x 1600',start_time_local:'2026-11-14 09:00:00',
  distance_m:13200},review:{positive:'5 Belastungen, ohne deutlichen Tempoabfall.',
  attention:'HF der Wiederholungen: 160 → 167 bpm.'},intervals:{activity:{load:97}}}
 const x=selectCoachDecision(plan,source)
 assert.equal(x.current,'ORC Track · optional')
 assert.equal(x.actionable,true)
 assert.match(x.causes.find(c=>c.key==='run').text,/5 Belastungen, ohne deutlichen Tempoabfall/)
 assert.match(x.causes.find(c=>c.key==='run').text,/Intervals Load 97 Punkte/)
 assert.match(x.causes.find(c=>c.key==='run').text,/160 → 167 bpm/)
 assert.equal(selectCoachDecision(plan,{...source,choices:[{training_date:'2026-11-17',option_code:'orc-track-tue',choice:'skipped'}]}).current,
  'ORC Track · ausgelassen')
 assert.doesNotMatch(x.causes.find(c=>c.key==='run').text,/100 Punkte ist eine Note/)
})
test('the weekly dashboard uses the last completed Monday-Sunday block, not an empty new week',()=>{
 const page=read('src/pages/CoachPage.tsx')
 const evidence=read('src/components/CoachEvidenceSummary.tsx')
 assert.match(page,/weekStart=\{coachAddDays\(mondayOf\(berlinToday\(\)\),-7\)\}/)
 assert.match(evidence,/LETZTE ABGESCHLOSSENE WOCHE/)
 assert.match(evidence,/WOCHENZWISCHENSTAND/)
})
test('home snapshot is loaded once for training today and the actual seven-day plan',()=>{
 const page=read('src/pages/CoachPage.tsx')
 const glance=read('src/components/CoachGlance.tsx')
 const seven=read('src/components/CoachSevenDay.tsx')
 const option=read('src/components/WeeklyTrainingOptions.tsx')
 assert.match(page,/loadCoachSnapshot\(session,berlinToday\(\),abort.signal\)/)
 assert.match(page,/sharedSnapshot=\{sharedSnapshot\}/)
 assert.match(page,/garmin-ai-weekly-choice-changed/)
 assert.match(page,/garmin-ai-coach-changed/)
 assert.match(glance,/if\(sharedSnapshot\)\{/)
 assert.match(glance,/applySources\(sharedSnapshot.options,sharedSnapshot.plans,sharedSnapshot.health/)
 assert.match(glance,/todayActivities,todayManual/)
 assert.match(glance,/TRAINING ERLEDIGT/)
 assert.match(glance,/Heute erledigt:/)
 assert.match(seven,/if\(sharedSnapshot\)\{setSnapshot\(sharedSnapshot\)/)
 assert.match(seven,/dispatchEvent\(new Event\('garmin-ai-coach-changed'\)\)/)
 assert.match(option,/garmin-ai-weekly-choice-changed/)
})
test('real coach retains explicit approval and opens calendar instead of silently changing it',()=>{
 const ui=read('src/components/CoachDecisionLive.tsx')
 const seven=read('src/components/CoachSevenDay.tsx')
 assert.match(ui,/garmin-coach-review\?id=/)
 assert.match(ui,/garmin-intervals-insights\?id=/)
 assert.match(ui,/getSession\(\)/)
 assert.match(ui,/review\?\.positive|review\.positive|review/)
 assert.match(seven,/onReview=\{date=>\{/)
 assert.match(seven,/Ja, Entwurf speichern/)
 assert.match(seven,/Es wurde noch nichts an Garmin oder Intervals\.icu gesendet/)
 assert.match(seven,/Vergangene Entwürfe im Kalender prüfen/)
 assert.doesNotMatch(ui,/method:'POST'/)
})
test('clean layout shows all seven selectable days with one focused decision',()=>{
 const page=read('src/pages/CoachPage.tsx')
 const seven=read('src/components/CoachSevenDay.tsx')
 const css=read('src/styles/coach-seven-day.css')
 assert.match(seven,/plan\.days\.map\(day=><button type="button" key=\{day.date\} role="tab"/)
 assert.match(seven,/plan\.days\.filter\(day=>day.date===selectedDay/)
 assert.match(seven,/role="tablist"/)
 assert.match(seven,/<details className="c7-settings" id="c7-life-settings">/)
 assert.match(page,/<details className="co-extra-tools">/)
 assert.match(css,/\.c7-settings/)
 assert.match(css,/\.c7-stale-plan/)
})
test('race weather preview clearly reports perceived temperature and peak precipitation',()=>{
 const weather=read('src/components/CoachRaceWeatherMini.tsx')
 assert.match(weather,/x\.feelsLike/)
 assert.match(weather,/x\.precipitation/)
 assert.match(weather,/Gefühlt \{view\.feels\}/)
 assert.match(weather,/Regenstärke max\./)
 assert.match(weather,/onClick=\{onOpenDetails\}/)
})

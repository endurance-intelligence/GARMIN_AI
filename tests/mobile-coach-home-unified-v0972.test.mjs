import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {summarizeDayActivity,dayCoachHeadline} from '../src/lib/coachDayStatus.mjs'
import {recoveryWeekTrend} from '../src/lib/recoveryWeekTrend.mjs'
import {recoveryDashboardMeaning} from '../src/lib/recoveryMeaning.mjs'
import {selectCoachDecision} from '../src/lib/coachDecision.mjs'
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8')
test('16.11.: skipped soccer + completed 33-minute mobility is TRAINING DONE, not sport-free',()=>{
 const date='2026-11-16',board={activities:[{
  activity_name:'Stabi & Mobility',sport_type:'mobility',start_time_local:'2026-11-16 10:24:25',
  duration_s:33.1*60
 }],manual:[]}
 const d=summarizeDayActivity(board,date)
 const summary=dayCoachHeadline({skipped:true,skippedTitle:'Fußball'},d)
 assert.equal(d.count,1)
 assert.equal(d.minutes,33)
 assert.equal(d.title,'Stabi & Mobility')
 assert.match(summary.title,/Heute erledigt: Stabi & Mobility/)
 assert.match(summary.note,/33 Min/)
 assert.match(summary.note,/Fußball bewusst ausgelassen/)
 assert.equal(summary.status,'TRAINING ERLEDIGT')
 assert.equal(dayCoachHeadline({skipped:true,skippedTitle:'Fußball'},summarizeDayActivity(board,'2026-11-15')).status,'BEWUSST AUSGELASSEN')
 assert.equal(dayCoachHeadline({skipped:false},summarizeDayActivity(null,date)),null)
})
test('duplicate manual mobility is not counted in addition to synced Garmin mobility',()=>{
 const d=summarizeDayActivity({activities:[{sport_type:'mobility',activity_name:'Stabi & Mobility',start_time_local:'2026-11-16 10:24:25',duration_s:1980}],
 manual:[{kind:'mobility',title:'Stabi',duration_minutes:33,session_date:'2026-11-16'}]},'2026-11-16')
 assert.equal(d.count,1)
 assert.equal(d.minutes,33)
})
test('15.11. HRV=56, 16.11. HRV=39 is a DAY dip; both weekly medians remain stable',()=>{
 const values=[54,49,65,42,69,41,49,58,55,47,48,51,56,39]
 const dates=Array.from({length:14},(_,i)=>new Date(Date.parse('2026-11-03T12:00:00Z')+i*86400000).toISOString().slice(0,10))
 const trend=recoveryWeekTrend(dates.map((d,i)=>({metric_date:d,hrv_ms:values[i],resting_heart_rate:44,sleep_seconds:27800})), '2026-11-16')
 assert.equal(trend.status,'stable')
 assert.equal(trend.metrics.hrv_ms.current,51)
 assert.equal(trend.metrics.hrv_ms.previous,49)
 const msg=recoveryDashboardMeaning({metrics:[
  {metric:'sleep_seconds',latest:27960,median:28320,difference:-360,sampleCount:12},
  {metric:'hrv_ms',latest:39,median:51,difference:-12,sampleCount:12},
  {metric:'resting_heart_rate',latest:43,median:44,difference:-1,sampleCount:12}
 ]},trend)
 assert.match(msg,/HRV-Wochenmedian 51 statt 49 ms \(stabil\)/)
 assert.match(msg,/heute/)
 assert.match(msg,/keine automatische Trainingsfreigabe/)
})
test('the real decision cites the last Saturday 5x1600 and Intervals Load; not fake readiness',()=>{
 const plan={today:'2026-11-16',days:[
  {date:'2026-11-16',kind:'completed',title:'Stabi gemacht',reason:'Gemessene Aktivität',approvable:false},
  {date:'2026-11-17',kind:'easy',title:'30 Min. locker statt Intervallen',minutes:30,reason:'Taper vor 112km.',approvable:true}
 ],flags:['Garmin: 23,2 km Laufumfang in 7 Tagen; Vorwoche 32,3 km','HRV 39 ms; Median 51 ms','Ruhepuls 43 bpm; Median 44 bpm','Schlaf 7,8 h; Median 7,9 h','Wettkampfziel Heartbeat Ultra Fulda am 2026-11-21'],signals:[],attentionText:''}
 const snapshot={options:{options:[{code:'orc-track-tue',weekday:2,enabled:true,title:'ORC Track',start_time:'19:00:00'}],choices:[]},
 boards:[{activities:[{sport_type:'mobility',start_time_local:'2026-11-16 10:24:25'}]}],
 recent:{activity:{id:'track1',name:'ORC Track - Extensive Intervalle - 5 x 1600',date:'2026-11-14',distanceKm:13.2,averageHr:152},
 review:{headline:'Intervalle sauber eingeteilt.',positive:'5 Belastungsabschnitte: konstante Wiederholungen ohne deutlichen Tempoabfall.',attention:'HF Ø 160 → 167 bpm.',goal:'Taper.',quality:'complete'},
 intervals:{load:97,comparison:{available:true,median:65,count:9,category:'higher'}}}}
 const d=selectCoachDecision(plan,snapshot)
 assert.equal(d.day.date,'2026-11-17')
 assert.equal(d.actionable,true)
 assert.match(d.current,/ORC Track · 19:00 \(optional\)/)
 assert.match(d.proposal,/30 Min\. locker/)
 assert.match(d.causes[0].text,/13,2 km/)
 assert.match(d.causes[0].text,/konstante Wiederholungen/)
 assert.match(d.causes[0].text,/HF Ø 160 → 167/)
 assert.match(d.causes[0].text,/Intervals Load 97 \(bisheriger Lauf-Median 65\)/)
 assert.match(d.causes[0].text,/Stabi\/Kraft/)
 assert.doesNotMatch(d.causes[0].text,/78 %|DEMO/)
 const noRecent=selectCoachDecision(plan,{...snapshot,recent:null})
 assert.match(noRecent.causes[0].text,/Keine aktuelle Laufbewertung/)
})
test('last completed Monday-Sunday week is the Coach review; on iPhone only 3 days visible initially',()=>{
 const page=read('src/pages/CoachPage.tsx'),seven=read('src/components/CoachSevenDay.tsx')
 assert.match(page,/weekStart=\{coachAddDays\(mondayOf\(berlinToday\(\)\),-7\)\}/)
 assert.match(page,/Letzte abgeschlossene Woche/)
 assert.match(seven,/plan\.days\.slice\(0,3\)/)
 assert.match(seven,/Weitere /)
 assert.match(seven,/showAllDays/)
 assert.match(seven,/aria-expanded=\{showAllDays\}/)
 assert.match(seven,/c7-life-settings/)
 assert.match(page,/co-extra-fold/)
 assert.match(seven,/window\.addEventListener\('garmin-ai-weekly-choice-changed'/)
 assert.match(seven,/window\.addEventListener\('garmin-ai-coach-data-changed'/)
})
test('the 7-day snapshot reaches BACK one week for the actual Saturday session',()=>{
 const s=read('src/lib/coachSnapshot.ts')
 assert.match(s,/coachMonday\(coachAddDays\(today,-7\)\)/)
 assert.match(s,/new Set\(\[previous,first,second,visible\]\)/)
 assert.match(s,/garmin-coach-review\?id=/)
 assert.match(s,/garmin-intervals-insights\?id=/)
 assert.match(s,/Promise\.allSettled/)
 assert.match(s,/age<=8/)
 const decision=read('src/components/CoachDecisionLive.tsx')
 assert.match(decision,/selectCoachDecision\(plan,snapshot\)/)
 assert.match(decision,/Keine automatische Änderung/)
})
test('rain and apparent temperature are taken from 15-hour forecast, never guessed',()=>{
 const s=read('src/components/CoachRaceWeatherMini.tsx')
 assert.match(s,/hours\.map\(x=>x\.feelsLike\)/)
 assert.match(s,/hours\.reduce\(\(sum,h\)=>sum\+h\.precipitation,0\)/)
 assert.match(s,/hours\.every\(\(h,i\)=>h\.epoch===hours\[0\]\.epoch\+i\*3600\)/)
 assert.match(s,/criticalAt/)
 assert.match(s,/Noch keine vollständige Stundenprognose/)
 const goal=read('src/components/CoachGoalPanel.tsx')
 assert.match(goal,/ERGEBNIS PRÜFEN/)
 assert.match(goal,/Ergebnis ansehen \/ nächstes Ziel wählen/)
 assert.match(goal,/phase\.daysUntil>=0\?<CoachRaceWeatherMini/)
})
test('old pending drafts are visibly unconfirmed, not silently cancelled or rescheduled',()=>{
 const calendar=read('src/components/CalendarWeekBoard.tsx')
 assert.match(calendar,/VERGANGEN · NICHT BESTÄTIGT/)
 assert.match(calendar,/Im Kalender prüfen und bewusst abschließen/)
 assert.doesNotMatch(calendar,/method:'DELETE'/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
import {selectCoachDecision} from '../src/lib/coachDecision.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const start='2026-11-16'
const fixture=()=>({
 today:start,health:{
  metrics:Array.from({length:18},(_,i)=>({metric_date:coachAddDays(start,i-17),
   hrv_ms:i===17?39:51,resting_heart_rate:43,sleep_seconds:7*3600+46*60})),
  training:{runKm7:42,previousRunKm7:39,truncated:false,historyStatus:'complete'}
 },
 boards:[{activities:[],manual:[]}],
 options:{options:[{code:'football',weekday:1,title:'Fußball',enabled:true}],choices:[
  {option_code:'football',training_date:start,choice:'skipped'}]},
 plans:{entries:[]},goal:{goal:{race_date:'2026-11-21',race_name:'Heartbeat Ultra Fulda',
  distance_km:112}},life:{context:{illness_state:'well',return_started_on:null,
  blocked_periods:[],run_reviews:[]},runs:[]}
})
test('live decision for Monday taper uses actual skipped football and the real race goal',()=>{
 const p=buildSevenDayCoach(fixture())
 const decision=selectCoachDecision(p)
 assert.equal(decision.day.date,start)
 assert.equal(decision.day.kind,'recovery')
 assert.match(decision.day.title,/Fußball auslassen/)
 assert.equal(decision.actionable,false)
 assert.equal(decision.state,'no-write')
 assert.match(decision.reason,/Sprints, Zweikämpfe/)
 assert.match(decision.causes[0].text,/42 km/)
 assert.match(decision.causes[1].text,/HRV 39 ms/)
 assert.match(decision.causes[2].text,/Heartbeat Ultra Fulda/)
 assert.doesNotMatch(decision.proposal,/6 × 1.000/)
})
test('first approvable recommendation is reviewed, never immediately approved or sent',()=>{
 const d=fixture();d.today='2026-11-17';d.options.choices=[]
 const result=selectCoachDecision(buildSevenDayCoach(d))
 assert.equal(result.day.kind,'easy')
 assert.equal(result.day.minutes,30)
 assert.equal(result.actionable,true)
 assert.equal(result.state,'review')
 assert.match(result.proposal,/30 Min\. locker/)
 const ui=read('src/components/CoachDecisionLive.tsx')
 const coach=read('src/components/CoachSevenDay.tsx')
 assert.match(ui,/onReview\(day.date\)/)
 assert.match(coach,/setReview\(date\);setStartTime\('18:00'\)/)
 assert.match(coach,/id=\{'c7-day-'\+day.date\}/)
 assert.match(coach,/review===day.date/)
 assert.match(coach,/Ja, Entwurf speichern/)
 assert.match(coach,/action:'create_coach_workout'/)
 assert.match(coach,/garmin-training-plan/)
 assert.match(coach,/setSnapshot\(prev=>prev\?/)
 assert.match(coach,/Es wurde noch nichts an Garmin oder Intervals.icu gesendet/)
 assert.doesNotMatch(ui,/method:\s*'POST'|setDecision\('approved'\)/)
})
test('a real existing calendar entry can only open the day; no duplicated proposal',()=>{
 const d=fixture()
 d.plans.entries=[{training_date:start,state:'draft',title:'Meine Intervalle',sport:'running'}]
 const decision=selectCoachDecision(buildSevenDayCoach(d))
 assert.equal(decision.state,'calendar')
 assert.equal(decision.actionable,false)
 assert.equal(decision.current,'Meine Intervalle')
 assert.match(decision.causes[2].text,/Heartbeat/)
 const ui=read('src/components/CoachDecisionLive.tsx')
 assert.match(ui,/onCalendar\(day.date\)/)
 assert.match(ui,/Bestehender Eintrag wird nicht überschrieben/)
})
test('illness and unavailable dates must not expose approval',()=>{
 const d=fixture();d.life.context.illness_state='sick'
 const ill=selectCoachDecision(buildSevenDayCoach(d))
 assert.equal(ill.day.kind,'illness')
 assert.equal(ill.actionable,false)
 const b=fixture();b.life.context.blocked_periods=[{id:'1',start:start,end:start,reason:'unavailable'}]
 const blocked=selectCoachDecision(buildSevenDayCoach(b))
 assert.equal(blocked.day.kind,'blocked')
 assert.equal(blocked.actionable,false)
})
test('incomplete Garmin evidence never gives a high-intensity or unsupported go-ahead',()=>{
 const d=fixture();d.health.training=null
 const plan=buildSevenDayCoach(d)
 const dec=selectCoachDecision(plan)
 assert.equal(dec.actionable,false)
 assert.match(dec.causes[0].text,/nicht verfügbar/)
 assert.match(dec.attentionText,/Datenlage|Garmin/)
})
test('premium cards use owner-only existing Coach snapshot, not simulated data or fake scores',()=>{
 const seven=read('src/components/CoachSevenDay.tsx')
 const page=read('src/pages/CoachPage.tsx')
 const component=read('src/components/CoachDecisionLive.tsx')
 const css=read('src/styles/coach-decision-live.css')
 const snapshot=read('src/lib/coachSnapshot.ts')
 assert.match(seven,/loadCoachSnapshot\(session,today,controller.signal\)/)
 assert.match(seven,/buildSevenDayCoach/)
 assert.match(seven,/<CoachDecisionLive plan=\{plan\}/)
 assert.match(seven,/Alle zugrunde liegenden Messwerte und Datenqualität anzeigen/)
 assert.ok(page.indexOf('<CoachSevenDay active=')<page.indexOf('<CoachEvidenceSummary active='))
 assert.doesNotMatch(page,/Coach-Prototyp ansehen · Demo/)
 assert.doesNotMatch(page,/78%|6 × 1.000 m|19 Tage bis zum Start/)
 assert.match(component,/THE REASONING \/ ECHTE DATEN/)
 assert.match(component,/Deine nächste Entscheidung/)
 assert.match(component,/Warum dieser/)
 assert.match(component,/Du entscheidest\. Keine automatische Änderung/)
 assert.match(css,/\.cdl-grid/)
 assert.match(css,/\.cdl-art/)
 assert.match(css,/@media\(max-width:600px\)/)
 for(const source of ['read-garmin-health','garmin-training-plan','garmin-coach-goal',
  'garmin-coach-context','garmin-week-board'])assert.ok(snapshot.includes(source))
 assert.doesNotMatch(component,/DEMO-SIGNAL|In Demo angenommen|78%/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveCoachQuestion,answerCoachQuestion} from '../src/lib/askCoach.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-25'
const f=()=>({today,health:{training:{runKm7:30,previousRunKm7:32,historyStatus:'complete',truncated:false},metrics:Array.from({length:18},(_,i)=>({metric_date:coachAddDays(today,i-17),hrv_ms:48,resting_heart_rate:42,sleep_seconds:27000}))},boards:[{activities:[],manual:[]}],plans:{entries:[]},options:{options:[{code:'orc-run',title:'ORC Run',weekday:3,sport:'running',enabled:true,start_time:'19:00',location_label:'Oerlinghausen'}],choices:[{option_code:'orc-run',training_date:today,choice:'skipped'}]},goal:{goal:{race_date:'2027-03-01',race_name:'Next race',distance_km:65}},life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[]},runs:[]}})
test('canceled run can create only an optional easy suggestion; recent ultra or blocked day still wins',()=>{
 const x=f(),d=buildSevenDayCoach(x).days[0]
 assert.equal(d.kind,'easy');assert.equal(d.minutes,30);assert.match(d.reason,/keine|kein/i)
 x.racePortfolio={others:[{race_date:'2026-11-21',race_name:'Heartbeat',distance_km:112}]}
 assert.equal(buildSevenDayCoach(x).days[0].kind,'recovery')
 x.life.context.blocked_periods=[{start:today,end:today,reason:'unavailable'}]
 assert.equal(buildSevenDayCoach(x).days[0].kind,'blocked')
 const saved=f();saved.plans.entries=[{training_date:today,state:'pending',title:'Already planned'}]
 assert.equal(buildSevenDayCoach(saved).days[0].kind,'existing')
})
test('weather topic uses the actual shared forecast; absent or different-date data cannot be presented as today',()=>{
 const plan=buildSevenDayCoach(f()),snapshot={},weather={date:today,text:'Oerlinghausen · 19:00–20:00 Uhr · 3 °C'}
 assert.equal(resolveCoachQuestion('Wie wird das Wetter heute beim Lauf?'),'weather')
 const answer=q=>answerCoachQuestion({topic:'weather',today,snapshot,plan,weather,query:q})
 assert.ok(answer('Wetter heute?').body.includes(weather.text))
 assert.doesNotMatch(answer('Wetter morgen?').body.join(' '),/3 °C/)
 assert.match(answerCoachQuestion({topic:'weather',today,snapshot,plan,weather:{...weather,date:'2026-11-24'}}).title,/keine aktuelle/)
})
test('Coach is focused on today and recovery, decision dialog and all group choices belong to Calendar, analysis is separate',()=>{
 const p=read('src/pages/CoachPage.tsx'),c=read('src/pages/CalendarPage.tsx'),d=read('src/components/TrainingDevelopment.tsx')
 assert.doesNotMatch(p,/<CoachGoalPanel|<CoachSevenDay|<CoachSessionBridge|<CoachEvidenceSummary/)
 assert.match(p,/weather={<CoachTodayWeather/)
 assert.match(p,/recoveryOnly/)
 assert.match(c,/<dialog className="coach-day-dialog"/)
 assert.match(c,/weekStart={start} compact/)
 assert.match(c,/garmin-ai-weekly-choice-changed/)
 assert.match(d,/<CoachSessionBridge/)
 assert.match(d,/<CoachEvidenceSummary/)
})

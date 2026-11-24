import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
import {buildCoachDailyBrief} from '../src/lib/coachDailyBrief.mjs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const today='2026-11-24'
const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',
 distance_km:112,target_hours:15}
const actual={
 activity_id:'synthetic-heartbeat-507',activity_name:'Heartbeat Ultra',
 start_time_local:'2026-11-21 06:00:00',sport_type:'ultra_run',
 duration_s:22680,distance_m:50700,rpe_raw:70,feeling_raw:50
}
const link={raceDate:goal.race_date,raceName:goal.race_name,
 activityId:actual.activity_id,confirmedOn:today}
const healthy=Array.from({length:15},(_,i)=>({
 metric_date:new Date(Date.parse('2026-11-10T12:00:00Z')+86400000*i)
  .toISOString().slice(0,10),
 resting_heart_rate:43,hrv_ms:50,sleep_seconds:27000
}))
const fixture=(overrides={})=>({
 today,goal:{goal},
 boards:[{start:'2026-11-16',activities:[actual],manual:[]}],
 health:{metrics:healthy,
  training:{runKm7:50.7,previousRunKm7:42,historyStatus:'complete',truncated:false}},
 plans:{entries:[]},options:{options:[],choices:[]},
 life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[],
  day_decisions:[],race_recovery_checks:[],post_workout_feedback:[],
  race_activity_links:[link]},runs:[]},...overrides
})

test('athlete-confirmed 50.7km Heartbeat produces a real recovery-first dashboard brief',()=>{
 const snapshot=fixture()
 const plan=buildSevenDayCoach(snapshot)
 const brief=buildCoachDailyBrief({plan,health:snapshot.health,today})
 assert.equal(plan.autoRaceRecovery.status,'matched')
 assert.equal(plan.autoRaceRecovery.matchStatus,'confirmed')
 assert.equal(plan.days[0].kind,'recovery')
 assert.equal(brief?.kind,'recovery')
 assert.equal(brief?.title,plan.days[0].title)
 assert.equal(brief?.reason,plan.days[0].reason)
 assert.equal(brief?.label,'REGENERATION')
 assert.equal(brief?.race.actualKm,50.7)
 assert.equal(brief?.race.daysSince,3)
 assert.equal(brief?.race.linkConfirmed,true)
 assert.match(brief?.symptomNote||'',/nicht aus Garmin-Werten erkannt/)
 assert.equal(brief?.dataNote,'')
 assert.equal(brief?.minutes,null)
 assert.ok(brief?.motive.includes('ruhiger'))
 assert.ok(!brief?.next.includes('Freigabe'))
})

test('the brief is not allowed to invent a runner feeling, symptom status or readiness score',()=>{
 const src=read('src/lib/coachDailyBrief.mjs')
 const ui=read('src/components/CoachDailyBrief.tsx')
 const snapshot=fixture({health:{metrics:[],training:null}})
 const plan=buildSevenDayCoach(snapshot)
 const brief=buildCoachDailyBrief({plan,health:snapshot.health,today})
 assert.ok(brief)
 assert.match(brief.dataNote,/nicht verfügbar/)
 assert.match(ui,/kein künstlicher Readiness-Score/)
 assert.doesNotMatch(src,/fitnessScore|readiness\s*[=:]|Math\.random\(/i)
 assert.doesNotMatch(src,/\.upsert\(|fetch\(|localStorage/)
 assert.doesNotMatch(ui,/navigator\.clipboard|fetch\(|\.upsert\(/)
})

test('stale recovery values remain explicitly stale; cannot be passed off as current',()=>{
 const snapshot=fixture()
 snapshot.health.metrics=[{metric_date:'2026-11-18',
  hrv_ms:51,resting_heart_rate:43,sleep_seconds:25000}]
 const plan=buildSevenDayCoach(snapshot)
 const brief=buildCoachDailyBrief({plan,health:snapshot.health,today})
 assert.equal(brief.latestHealth,'2026-11-18')
 assert.match(brief.dataNote,/älter als zwei Tage/)
 assert.match(brief.dataNote,/2026-11-18/)
})

test('illness, an existing calendar entry and completed workout preserve original recommendations',()=>{
 const illness=fixture()
 illness.life.context.illness_state='sick'
 const p1=buildSevenDayCoach(illness)
 const b1=buildCoachDailyBrief({plan:p1,health:illness.health,today})
 assert.equal(b1.kind,'illness')
 assert.equal(b1.label,'TRAININGSPAUSE')
 assert.match(b1.next,/Pause beibehalten/)
 const calendar=fixture({goal:{goal:{race_name:'Next race',race_date:'2027-04-25',distance_km:31.1}},
  health:{metrics:healthy,training:{runKm7:40,previousRunKm7:38,
   historyStatus:'complete',truncated:false}},
  plans:{entries:[{training_date:today,title:'Existing session',
   sport:'running',state:'pending'}]}})
 const p2=buildSevenDayCoach(calendar)
 const b2=buildCoachDailyBrief({plan:p2,health:calendar.health,today})
 assert.equal(b2.title,p2.days[0].title)
 assert.equal(b2.kind,'existing')
 assert.match(b2.next,/Bestehenden Termin im Kalender prüfen/)
})

test('no snapshot, incomplete daily plan, malformed date: no fabricated recommendation',()=>{
 assert.equal(buildCoachDailyBrief({today,plan:null}),null)
 assert.equal(buildCoachDailyBrief({today,plan:{days:[]}}),null)
 assert.equal(buildCoachDailyBrief({today:'2026-02-31',plan:{days:[]}}),null)
 assert.equal(buildCoachDailyBrief({today,plan:{days:[{date:'2026-11-25',
  kind:'easy',title:'No',reason:'No'}]}}),null)
})

test('homepage puts one coaching decision before past goal and Garmin/calendar detail cards',()=>{
 const page=read('src/pages/CoachPage.tsx')
 const brief=read('src/components/CoachDailyBrief.tsx')
 const goalPanel=read('src/components/CoachGoalPanel.tsx')
 const healthDialog=read('src/components/CoachHealthStatus.tsx')
 const styles=read('src/styles/coach-daily-brief.css')
 assert.ok(page.indexOf('<CoachDailyBrief brief={dailyBrief}')>
  page.indexOf('return ('))
 assert.ok(page.indexOf('<CoachDailyBrief brief={dailyBrief}')<
  page.indexOf('<CoachGoalPanel active={active} compact'))
 assert.ok(page.indexOf('<CoachDailyBrief brief={dailyBrief}')<
  page.indexOf('<CoachGlance active={active}'))
 assert.match(page,/buildSevenDayCoach\(\{/)
 assert.match(page,/buildCoachDailyBrief\(\{today:coachToday,plan:dailyPlan/)
 assert.match(page,/dailyBrief&&!snapshotLoading&&!snapshotError/)
 assert.match(page,/openCoachDecision/)
 assert.match(page,/setHealthOpenToken\(n=>n\+1\)/)
 assert.match(healthDialog,/if\(active&&openToken>0\)setOpen\(true\)/)
 assert.match(brief,/Ausführliche Coach-Entscheidung|brief\.actionLabel/)
 assert.match(brief,/Beschwerden \/ Pause melden/)
 assert.match(brief,/I fall\. I rise\. I show up\. I improve\./)
 assert.match(goalPanel,/goalIsPast\?'LETZTER WETTKAMPF/)
 assert.match(goalPanel,/!goalIsPast&&<CoachRaceWeatherMini/)
 assert.match(styles,/@media\(max-width:760px\)/)
 assert.match(styles, /min-height:44px/)
})

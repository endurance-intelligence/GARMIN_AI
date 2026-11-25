import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {analyzeGoalProgress} from '../src/lib/goalProgress.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-17'
const starts=['2026-10-19','2026-10-26','2026-11-02','2026-11-09']
const act=(id,date,km,mins,sport='running')=>({
 activity_id:id,activity_name:'Training '+id,
 start_time_local:date+' 08:00:00',sport_type:sport,
 distance_m:km===null?null:km*1000,duration_s:mins===null?null:mins*60
})
const boards=()=>[
 {start:starts[0],activities:[act('a','2026-10-20',8,46),act('b','2026-10-23',12,80)],manual:[]},
 {start:starts[1],activities:[act('c','2026-10-27',10,55),act('d','2026-10-30',20,140)],manual:[]},
 {start:starts[2],activities:[act('e','2026-11-03',9,55),act('f','2026-11-07',16,110),
  act('cross','2026-11-06',6,65,'soccer')],manual:[]},
 {start:starts[3],activities:[act('g','2026-11-10',7,40),act('h','2026-11-12',22,180)],manual:[]}
]
const full=(extra={})=>({
 today,goal:{goal:{race_name:'Heartbeat Ultra Fulda',race_date:'2026-12-21',distance_km:112}},
 boards:boards(),health:{training:{historyStatus:'complete',truncated:false}},
 ...extra
})
test('Four PREVIOUS complete ISO weeks, not current partial or calendar options',()=>{
 const x=full()
 x.boards.push({start:'2026-11-16',
  activities:[act('future','2026-11-17',80,1000)],manual:[]})
 const p=analyzeGoalProgress(x)
 assert.equal(p.status,'ready')
 assert.deepEqual(p.weeks.map(w=>w.start),starts)
 assert.deepEqual(p.weeks.map(w=>w.km),[20,30,25,29])
 assert.equal(p.window.start,'2026-10-19')
 assert.equal(p.window.end,'2026-11-15')
 assert.equal(p.totalKm,104)
 assert.equal(p.kmPerWeek,26)
 assert.equal(p.activeWeeks,4)
 assert.equal(p.runCount,8)
 assert.equal(p.runDays,8)
 assert.equal(p.longest.minutes,180)
 assert.equal(p.longest.distanceKm,22)
 assert.equal(p.longest.date,'2026-11-12')
 assert.equal(p.kind,'Ultra')
 assert.equal(p.pillars.length,4)
 assert.match(p.next,/Zeit auf den Beinen/)
})
test('No manufactured 0km for missing history or missing board',()=>{
 const x=full()
 x.boards=x.boards.filter(b=>b.start!=='2026-10-26')
 const p=analyzeGoalProgress(x)
 assert.equal(p.status,'partial')
 assert.equal(p.weeks[1].available,false)
 assert.equal(p.weeks[1].km,null)
 assert.equal(p.totalKm,null)
 assert.equal(p.kmPerWeek,null)
 assert.equal(p.activeWeeks,null)
 assert.match(p.next,/Synchronisierung|fehlende Trainingswochen/)
 assert.equal(p.longest.minutes,180)
})
test('Garmin backfill status prevents falsely complete progress statistics',()=>{
 const x=full()
 x.health.training.historyStatus='backfill'
 const p=analyzeGoalProgress(x)
 assert.equal(p.status,'partial')
 assert.equal(p.totalKm,null)
 assert.equal(p.runCount,null)
 assert.match(p.evidenceLabel,/Datenlage eingeschränkt/)
 assert.equal(p.longest.minutes,180)
})
test('Missing distance does not turn a long workout into zero distance',()=>{
 const x=full()
 x.boards[2].activities[0].distance_m=null
 const p=analyzeGoalProgress(x)
 assert.equal(p.status,'ready')
 assert.equal(p.weeks[2].km,null)
 assert.equal(p.totalKm,null)
 assert.equal(p.longest.minutes,180)
 assert.match(p.pillars[2].summary,/nicht zuverlässig belegbar/)
})
test('Missing durations and non-running cross-training are not counted as runs',()=>{
 const x=full()
 x.boards[3].activities[1].duration_s=null
 const p=analyzeGoalProgress(x)
 assert.equal(p.runCount,8)
 assert.equal(p.weeks[3].minutes,null)
 assert.equal(p.longest.minutes,140)
 assert.equal(p.longest.distanceKm,20)
 assert.equal(p.weeks[2].runCount,2)
})
test('Duplicate IDs, out-of-range/future activities and invalid dates do not inflate evidence',()=>{
 const x=full()
 x.boards[0].activities.push({...x.boards[0].activities[0]})
 x.boards[0].activities.push(act('wrong','2026-11-17',30,200))
 x.boards[0].activities.push(act('future','bad-date',20,60))
 const p=analyzeGoalProgress(x)
 assert.equal(p.runCount,8)
 assert.equal(p.totalKm,104)
})
test('Race-week and post-race advice prioritizes recovery, not last-minute new long runs',()=>{
 const near=full({goal:{goal:{race_name:'Heartbeat',race_date:'2026-11-21',distance_km:112}}})
 const a=analyzeGoalProgress(near)
 assert.equal(a.raceSoon,true)
 assert.match(a.next,/frisch bleiben/)
 assert.doesNotMatch(a.next,/Trainingsrekorde|Steigerungen/)
 const after=full({goal:{goal:{race_name:'Heartbeat',race_date:'2026-11-10',distance_km:112}}})
 const b=analyzeGoalProgress(after)
 assert.equal(b.afterRace,true)
 assert.match(b.next,/Erholung/)
})
test('Race-specific guidance differs for ultra, long distance and short run, no false readiness',()=>{
 const ultra=analyzeGoalProgress(full())
 assert.match(ultra.pillars[3].summary,/Kohlenhydrat-\/Trinktraining/)
 assert.match(ultra.pillars[3].summary,/nicht nachweisen/)
 const half=analyzeGoalProgress(full({goal:{goal:{race_name:'Hermannslauf',race_date:'2027-04-26',distance_km:31.1}}}))
 assert.equal(half.kind,'Langdistanz')
 assert.match(half.pillars[3].summary,/Höhenmeter/)
 const five=analyzeGoalProgress(full({goal:{goal:{race_name:'5km',race_date:'2027-04-26',distance_km:5}}}))
 assert.equal(five.kind,'Lauf')
 assert.match(five.pillars[3].summary,/LT1/)
 const missing=analyzeGoalProgress(full({goal:{goal:null}}))
 assert.equal(missing.status,'missing-goal')
 assert.equal(missing.raceName,null)
 assert.equal(missing.totalKm,104,'real logged distance can exist without current goal')
 assert.doesNotMatch(JSON.stringify([ultra,half,five]),/fitnessPercent|readinessScore|completionProbability/)
})
test('sudden documented volume rise recommends observation not aggressive progress',()=>{
 const x=full()
 x.boards[0].activities=[act('a','2026-10-20',10,80)]
 x.boards[1].activities=[act('b','2026-10-27',10,80)]
 x.boards[2].activities=[act('c','2026-11-03',23,160)]
 x.boards[3].activities=[act('d','2026-11-10',25,190)]
 const p=analyzeGoalProgress(x)
 assert.match(p.pillars[2].summary,/deutlich mehr Laufkilometern/)
 assert.match(p.next,/nicht direkt weiter steigern/)
})
test('Goals shows accessible progress, factual bars, limitations and Race Prep handoff',()=>{
 const goals=read('src/pages/GoalsPage.tsx')
 const ui=read('src/components/GoalProgressCard.tsx')
 const css=read('src/styles/goal-progress.css')
 const snap=read('src/lib/coachSnapshot.ts')
 const model=read('src/lib/goalProgress.mjs')
 assert.match(goals,/loadCoachSnapshot\(session,berlinDateToday\(\),controller.signal,undefined,4\)/)
 assert.match(read('src/components/TrainingDevelopment.tsx'),/<GoalProgressCard today=\{today\} snapshot=\{snapshot\}/)
 assert.match(read('src/pages/TrainingPage.tsx'),/onRacePrep=\{\(\)=>onGo\('race'\)\}/)
 assert.match(snap,/const back=Number.isInteger\(historyWeeks\)/)
 assert.match(snap,/Array.from\(\{length:back\}/)
 assert.match(ui,/Was du für dein Rennen schon getan hast/)
 assert.match(ui,/gpg-weekly/)
 assert.match(ui,/Keine Angabe/)
 assert.match(ui,/was fehlt noch/i)
 assert.match(ui,/Keine|keinen Fitnesswert/)
 assert.match(ui,/onClick=\{onRacePrep\}/)
 assert.match(css,/@media\(max-width:390px\)/)
 assert.doesNotMatch(model,/\.upsert\(|\.insert\(|fetch\(|Math\.random\(|fitnessScore|readinessPercent/)
})

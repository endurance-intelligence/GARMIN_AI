import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildCoachProgressStory} from '../src/lib/coachProgressStory.mjs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const today='2026-11-24'
const starts=['2026-10-26','2026-11-02','2026-11-09','2026-11-16']
const mondayDays=starts.map(s=>[s,
 new Date(Date.parse(s+'T12:00:00Z')+2*86400000).toISOString().slice(0,10)])
const make=(start,week,km,i,attrs={})=>({
 activity_id:'synthetic-p2-'+week+'-'+i,
 sport_type:'running',start_time_local:
  mondayDays[week][i]+' 08:00:00',
 distance_m:km*1000,duration_s:km*360,
 average_heart_rate:136,rpe_raw:40,feeling_raw:75,...attrs
})
const boards=()=>starts.map((start,week)=>({
 start,activities:[make(start,week,week===0?11:week===1?12:week===2?15:16,0),
 make(start,week,week===0?12:week===1?12:week===2?15:16,1)],manual:[]
}))
const fixture=(over={})=>({
 goal:{goal:{race_name:'Spring half',race_date:'2027-04-25',
 distance_km:21.1,target_hours:2}},
 boards:boards(),
 health:{training:{historyStatus:'complete',truncated:false},metrics:[]},
 plans:{entries:[],historyFrom:'2026-10-01'},
 life:{context:{day_decisions:[],illness_state:'well',blocked_periods:[]},runs:[]},
 ...over
})

test('P2 reuses real four completed weeks; Garmin counts, run days, longest and trends are factual',()=>{
 const x=buildCoachProgressStory({today,snapshot:fixture()})
 assert.ok(x)
 assert.equal(x.status,'complete')
 assert.equal(x.totalKm,23+24+30+32)
 assert.equal(x.activeWeeks,4)
 assert.equal(x.runDays,8)
 assert.equal(x.knownWeeks,4)
 assert.equal(x.weeks.length,4)
 assert.equal(x.weeks[0].start,'2026-10-26')
 assert.equal(x.weeks[3].start,'2026-11-16')
 assert.equal(x.longest.distanceKm,16)
 assert.equal(x.previousTwoKm,47)
 assert.equal(x.recentTwoKm,62)
 assert.equal(x.percentChange,32)
 assert.equal(x.trend,'higher')
 assert.equal(x.ratedRuns,8)
 assert.equal(x.totalRuns,8)
 assert.equal(x.loadCaution,false)
 assert.match(x.trendText,/keine Aussage über Tempo oder Fitness/)
 assert.match(x.performanceNote,/ähnlicher Herzfrequenz/)
 assert.match(x.caveat,/keine.*Fitnessfortschritt/i)
})

test('missing weeks are UNKNOWN, never a four-week total or a fabricated zero-km training week',()=>{
 const saved=fixture()
 saved.boards.splice(2,1)
 const x=buildCoachProgressStory({today,snapshot:saved})
 assert.equal(x.status,'limited')
 assert.equal(x.knownWeeks,3)
 assert.equal(x.totalKm,null)
 assert.equal(x.activeWeeks,null)
 assert.equal(x.runDays,null)
 assert.equal(x.percentChange,null)
 assert.equal(x.trend,'unknown')
 assert.equal(x.weeks[2].km,null)
 assert.match(x.trendText,/nicht als null Kilometer/)
})

test('Garmin reimport with same ID does not double completed distance or self-rating',()=>{
 const snap=fixture()
 snap.boards[0].activities.push({...snap.boards[0].activities[0]})
 const x=buildCoachProgressStory({today,snapshot:snap})
 assert.equal(x.totalKm,109)
 assert.equal(x.runDays,8)
 assert.equal(x.totalRuns,8)
})

test('Garmin backfill incomplete and missing distances stay limited despite four available weeks',()=>{
 const s=fixture()
 s.health.training.historyStatus='partial'
 const p=buildCoachProgressStory({today,snapshot:s})
 assert.equal(p.totalKm,null)
 assert.equal(p.status,'limited')
 const t=fixture()
 t.boards[0].activities[0].distance_m=null
 const q=buildCoachProgressStory({today,snapshot:t})
 assert.equal(q.totalKm,null)
 assert.equal(q.weeks[0].km,null)
 assert.equal(q.trend,'unknown')
})

test('unfinished ultra in the completed week is an outlier, NOT a proof of fitness progress',()=>{
 const s=fixture()
 s.goal={goal:{race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',distance_km:112}}
 s.boards[3].activities[1]={...s.boards[3].activities[1],
  start_time_local:'2026-11-21 06:00:00',
  distance_m:50700,duration_s:22680}
 const x=buildCoachProgressStory({today,snapshot:s})
 assert.equal(x.trend,'race-outlier')
 assert.equal(x.percentChange,null)
 assert.equal(x.previousTwoKm,null)
 assert.equal(x.recentTwoKm,null)
 assert.match(x.trendText,/Ultra-Wettkampf/)
 assert.match(x.next,/Erholung/)
 assert.equal(x.totalKm,23+24+30+16+50.7)
})

test('a low early baseline cannot become a huge misleading percentage',()=>{
 const s=fixture()
 for(const board of s.boards.slice(0,2))
  for(const a of board.activities)a.distance_m=2000
 const p=buildCoachProgressStory({today,snapshot:s})
 assert.equal(p.trend,'low-baseline')
 assert.equal(p.percentChange,null)
 assert.match(p.trendText,/Prozenttrend wäre irreführend/)
})

test('no fabricated performance claims and no extra source/network or writes',()=>{
 const src=read('src/lib/coachProgressStory.mjs')
 const ui=read('src/components/CoachProgressPulse.tsx')
 assert.match(src,/analyzeGoalProgress\(/)
 assert.match(src,/analyzeCoachFourWeeks\(/)
 assert.doesNotMatch(src,/fetch\(|\.upsert\(|\.insert\(|Math\.random\(/)
 assert.doesNotMatch(src,/readinessScore|fitnessScore|fitnessPercent|predictedRaceTime/i)
 assert.match(ui,/Kein erfundener Fitnesswert/)
 assert.match(ui,/Bin ich wirklich schneller geworden\?/)
 assert.match(ui,/Tempo\/Puls und Streckenvergleich prüfen/)
 assert.match(ui,/progress\.weeks\.map/)
 assert.match(ui,/w\.km===null/)
 assert.doesNotMatch(ui,/fetch\(|\.upsert\(|\.insert\(|localStorage/)
})

test('P2 follows the daily coach brief and decision workflow, links to existing 8/12 week evidence',()=>{
 const page=read('src/pages/CoachPage.tsx')
 const longTerm=read('src/components/CoachLongTermCard.tsx')
 const coach=read('src/components/CoachSevenDay.tsx')
 const style=read('src/styles/coach-progress-pulse.css')
 assert.match(page,/<CoachProgressPulse/)
 assert.ok(page.indexOf('<CoachDailyBrief')<page.indexOf('<CoachProgressPulse'))
 assert.ok(page.indexOf('<CoachSevenDay')<page.indexOf('<CoachProgressPulse'))
 assert.match(page,/id="coach-development"[\s\S]*<CoachProgressPulse/)
 assert.match(page,/sharedSnapshot&&!snapshotLoading&&!snapshotError&&<CoachProgressPulse/)
 assert.match(page,/new Event\('garmin-ai-open-long-term-progress'\)/)
 assert.match(longTerm,/addEventListener\('garmin-ai-open-long-term-progress',openFromDashboard\)/)
 assert.match(longTerm,/setExpanded\(true\)/)
 assert.match(longTerm,/id="coach-long-term-progress"/)
 assert.match(longTerm,/garmin-week-board\?start=/)
 assert.match(longTerm,/<CoachAerobicEfficiencyCard/)
 assert.match(longTerm,/<CoachReferenceRoutesCard/)
 assert.match(coach,/<CoachLongTermCard today=\{today\} snapshot=\{snapshot\} active=\{active\}\/>/)
 assert.match(style,/@media\(max-width:430px\)/)
 assert.match(style,/min-height:44px/)
})

test('invalid or unavailable input yields no fictional progress dashboard',()=>{
 assert.equal(buildCoachProgressStory({today,snapshot:null}),null)
 assert.equal(buildCoachProgressStory({today:'not-a-date',snapshot:fixture()}),null)
 assert.equal(buildCoachProgressStory({today,snapshot:{boards:[],plans:null}}),null)
})

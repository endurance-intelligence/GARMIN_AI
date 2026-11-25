import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSevenDayCoach} from '../src/lib/coachSevenDay.mjs'
import {buildCoachDailyBrief} from '../src/lib/coachDailyBrief.mjs'
import {selectCoachDecision} from '../src/lib/coachDecision.mjs'
const today='2026-11-25'
const fixture=()=>({today,health:{training:{runKm7:50,previousRunKm7:30,historyStatus:'complete'},metrics:[]},
 boards:[],plans:{entries:[]},goal:{goal:{race_date:'2026-12-19',race_name:'Hermann Ultra',distance_km:65}},
 racePortfolio:{others:[{race_date:'2026-11-21',race_name:'Heartbeat Ultra',distance_km:112}]},
 options:{options:[{code:'orc-run',title:'ORC Run',enabled:true,weekday:3,start_time:'19:00:00',sport:'running',location_label:'Oerlinghausen'}],
 choices:[{option_code:'orc-run',training_date:today,choice:'selected'}]},
 life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[],day_decisions:[],race_recovery_checks:[]},runs:[]}})
test('confirmed ORC Run remains scheduled during previous ultra recovery, no workout approval',()=>{
 const f=fixture(),p=buildSevenDayCoach(f),d=p.days[0]
 assert.equal(d.kind,'chosen');assert.equal(d.title,'ORC Run');assert.equal(d.approvable,false)
 assert.equal(d.selectedGroup.advice,'skip');assert.equal(d.selectedGroup.startTime,'19:00')
 assert.match(d.reason,/4 Tage nach Heartbeat Ultra/)
 assert.match(d.reason,/Coach rät heute/)
 assert.match(d.reason,/abbrechen/)
 assert.equal(p.trainingMethod.qualityDay,null)
 const b=buildCoachDailyBrief({today,plan:p,health:f.health})
 assert.equal(b.title,'ORC Run');assert.equal(b.label,'TEILNAHME BESTÄTIGT')
 assert.match(b.guidance,/rät/)
 assert.equal(selectCoachDecision(p,{options:f.options.options,choices:f.options.choices,selectedDate:today}).actionable,false)
})
test('open and skipped options do not override postrace recovery',()=>{
 for(const choice of ['open','skipped']){
  const f=fixture();f.options.choices[0].choice=choice
  const d=buildSevenDayCoach(f).days[0]
  assert.equal(d.kind,'recovery');assert.equal(d.selectedGroup,undefined)
 }
})
test('illness and blocked day retain protective state despite confirmed attendance',()=>{
 const f=fixture();f.life.context.illness_state='sick'
 const sick=buildSevenDayCoach(f).days[0]
 assert.equal(sick.kind,'illness');assert.equal(sick.selectedGroup.advice,'skip');assert.match(sick.reason,/nicht teilnehmen/)
 const b=fixture();b.life.context.blocked_periods=[{start:today,end:today,reason:'vacation'}]
 assert.equal(buildSevenDayCoach(b).days[0].kind,'blocked')
})
test('normal confirmed group never creates extra workout, race day retains priority',()=>{
 const f=fixture();f.racePortfolio.others=[];f.health.training.runKm7=30
 const d=buildSevenDayCoach(f).days[0]
 assert.equal(d.kind,'chosen');assert.equal(d.approvable,false)
 assert.match(d.reason,/Sprechtempo/)
 f.goal.goal.race_date=today
 assert.equal(buildSevenDayCoach(f).days[0].kind,'race')
 assert.equal(buildSevenDayCoach(f).days[0].selectedGroup,undefined)
})
test('calendar reloads upon stored choice and renders confirmed attendance separately from advice',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const c=read('src/pages/CalendarPage.tsx'),b=read('src/components/CalendarWeekBoard.tsx')
 assert.match(c,/addEventListener\('garmin-ai-weekly-choice-changed',changed\)/)
 assert.match(c,/coachDay.selectedGroup/)
 assert.match(b,/TEILNAHME BESTÄTIGT/)
 assert.match(b,/!candidate.selectedGroup/)
 assert.match(b,/is-confirmed-group/)
})

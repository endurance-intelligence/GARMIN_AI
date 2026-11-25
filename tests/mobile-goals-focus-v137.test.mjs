import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recentGoalRecovery} from '../src/lib/recentGoalRecovery.mjs'
import {buildLongTermCoachPlan} from '../src/lib/coachLongTermPlan.mjs'
import {analyzeGoalProgress} from '../src/lib/goalProgress.mjs'
const today='2026-11-25',goal={goal:{race_name:'Hermann Ultra',race_date:'2026-12-19',distance_km:65}}
const racePortfolio={others:[{race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',distance_km:112}]}
const health={training:{runKm7:50,previousRunKm7:30,historyStatus:'complete'}}
test('a new goal does not erase recovery or count a recent race as normal baseline',()=>{
 const x=buildLongTermCoachPlan({today,goal,health,racePortfolio})
 assert.equal(x.raceName,'Hermann Ultra');assert.equal(x.baselineKm,null)
 assert.equal(x.weeks[0].phase,'recovery');assert.equal(x.weeks[1].phase,'recovery')
 assert.ok(x.weeks.slice(0,2).every(w=>w.targetKm===null&&w.qualityOptions===0&&w.longRunMinutes===null))
 assert.ok(x.weeks.some(w=>w.isRaceWeek))
 assert.match(x.notes.join(' '),/Heartbeat Ultra Fulda/)
 const progress=analyzeGoalProgress({today,goal,health,racePortfolio,boards:[]})
 assert.match(progress.next,/Erholung nach Heartbeat/)
})
test('recovery helper ignores future and invalid dates and expires after 14 days',()=>{
 assert.equal(recentGoalRecovery({today:'2026-12-06',racePortfolio}),null)
 assert.equal(recentGoalRecovery({today:'2026-11-20',racePortfolio}),null)
 assert.equal(recentGoalRecovery({today,racePortfolio:{others:[{race_date:'2026-11-99',distance_km:50}]}}),null)
 assert.equal(recentGoalRecovery({today,racePortfolio}).until,'2026-12-05')
})
test('goal screen prioritizes current action and avoids stale plan while refreshing',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const p=read('src/pages/GoalsPage.tsx')
 const order=['<CoachGoalPanel','<RaceGoalsPanel','<CoachLongTermPlan','<ChallengeSetup','<RaceEventResearch']
 for(let i=1;i<order.length;i++)assert.ok(p.indexOf(order[i])>p.indexOf(order[i-1]),order[i])
 assert.match(p,/snapshot&&!loading&&!error&&<CoachLongTermPlan/)
 assert.doesNotMatch(p,/<GoalProgressCard|<PolarizedMethodCard/)
 assert.match(read('src/components/RaceGoalsPanel.tsx'),/rgp-focus-list/)
 assert.doesNotMatch(read('src/components/RaceGoalsPanel.tsx'),/className="rgp-main"/)
 const card=read('src/components/GoalProgressCard.tsx')
 assert.ok(card.indexOf('className="gpg-next"')<card.indexOf('className="gpg-metrics"'))
 assert.match(read('src/lib/askCoach.mjs'),/racePortfolio:snapshot.racePortfolio/)
})

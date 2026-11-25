import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Goals contains only main goal and plan by default; portfolio controls stay available in modal',()=>{
 const p=read('src/pages/GoalsPage.tsx')
 assert.match(p,/onClick=\{openPortfolio\}/)
 assert.match(p,/\.showModal\(\)/)
 assert.match(p,/garmin-ai-add-race-goal/)
 assert.match(p,/<ChallengeSetup[^]*?summaryOnly\/>/)
 assert.ok(p.indexOf('<CoachLongTermPlan')<p.indexOf('<dialog'))
 assert.ok(p.indexOf('<RaceGoalsPanel')>p.indexOf('<dialog'))
 assert.ok(p.indexOf('<RaceEventResearch')<p.indexOf('</dialog>'))
 assert.doesNotMatch(p,/Trainingsfortschritt in Analyse ansehen/)
 assert.match(read('src/components/RaceGoalsPanel.tsx'),/onPortfolioChange\?\.\(\)/)
})
test('Race Prep owns a single map and editable challenge route, saved summary still matches primary goal',()=>{
 const p=read('src/pages/RacePage.tsx'),v=read('src/components/RaceRouteViewer.tsx'),c=read('src/components/ChallengeSetup.tsx')
 assert.match(p,/routeEditor=\{<ChallengeSetup active=\{active\}/)
 assert.match(v,/\{routeEditor\}/)
 assert.equal((v.match(/<iframe/g)||[]).length,1)
 assert.doesNotMatch(c,/<iframe/)
 assert.match(c,/if\(!active\|\|summaryOnly\)return null/)
 assert.match(c,/x.event_title===g.raceName&&x.race_date===g.raceDate/)
 assert.match(c,/const canEdit=!saved\|\|isChallenge/)
 assert.match(c,/action:'save_challenge'/)
})

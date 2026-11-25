import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('route facts are owned by saved matching goal and shown once in hero',()=>{
 const hero=read('src/components/CoachGoalPanel.tsx'),route=read('src/components/ChallengeSetup.tsx'),page=read('src/pages/GoalsPage.tsx')
 assert.match(hero,/routeSummary\?\.raceName===goal\?\.race_name&&routeSummary\?\.raceDate===goal\?\.race_date/)
 assert.match(hero,/routeFacts\.ascent/)
 assert.match(hero,/routeFacts\.course/)
 assert.match(page,/onRouteSummary=\{setRouteSummary\}/)
 assert.match(route,/onRouteSummary\?\.\(\{\.\.\.saved,raceName:goal.raceName,raceDate:goal.raceDate\}\)/)
 assert.doesNotMatch(route,/className="challenge-facts"/)
 assert.match(hero,/cg-hero-actions/)
 assert.match(hero,/cg-home-edit cg-hero-edit/)
})
test('upcoming goals visible, past goals collapsed, promotion still explicit',()=>{
 const p=read('src/components/RaceGoalsPanel.tsx')
 assert.match(p,/upcoming.map\(renderRace\)/)
 assert.match(p,/<details className="rgp-focus-list"><summary>Vergangene Ziele/)
 assert.match(p,/Als Hauptziel bestätigen/)
 assert.match(p,/action:'promote',id:x.id/)
})
test('route embed has real map space and source link without token in external referrer',()=>{
 const css=read('src/styles/goals-page.css'),route=read('src/components/ChallengeSetup.tsx')
 assert.match(css,/height:clamp\(620px,53vw,820px\)/)
 assert.match(route,/In Komoot öffnen/)
 assert.match(route,/referrerPolicy="no-referrer"/)
 assert.match(css,/font-size:clamp\(58px,8vw,112px\)/)
})

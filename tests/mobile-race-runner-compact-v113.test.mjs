import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildRunnerFocus} from '../src/lib/raceRunnerFocus.mjs'
import {buildRaceExecution} from '../src/lib/raceExecution.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const plan=buildRaceExecution({distanceKm:112,courseMode:'laps',loopKm:6,
 movingMinutes:42,regularPauseMinutes:3,longStopEvery:3,longStopMinutes:8,
 paceSeconds:null,targetHours:15,carbsGPerHour:75,fluidMlPerHour:500,
 sodiumMgPerHour:500}).checkpoints

test('runner action and round are a single compact desktop row and a full width mobile action',()=>{
 const c=read('src/components/RaceRunnerFocus.tsx')
 const css=read('src/styles/race-runner-focus.css')
 assert.match(c,/<div className="rrf-primary">/)
 assert.match(c,/<div className="rrf-center"/)
 assert.match(c,/<div className="rrf-actions">/)
 assert.ok(c.indexOf('<div className="rrf-primary">')<
   c.indexOf('<div className="rrf-center"'))
 assert.ok(c.indexOf('<div className="rrf-center"')<
   c.indexOf('<div className="rrf-actions"'))
 assert.match(c,/className="rrf-done"/)
 assert.match(css,/\.rrf-primary\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(225px,\.6fr\)/)
 assert.match(css,/\.rrf-actions \.rrf-done\{width:100%;min-height:64px/)
 assert.match(css,/@media\(max-width:700px\)/)
 assert.match(css,/\.rrf-primary\{grid-template-columns:1fr/)
 assert.match(css,/\.rrf-actions \.rrf-done\{min-height:54px/)
 assert.doesNotMatch(css,/max-width:410px|max-width:500px/)
 assert.doesNotMatch(css,/justify-content:center;flex-wrap:wrap/)
})
test('runner remains single-round, manual, and excludes distances and time budget',()=>{
 const c=read('src/components/RaceRunnerFocus.tsx')
 const model=read('src/lib/raceRunnerFocus.mjs')
 assert.match(c,/Runde geschafft/)
 assert.match(c,/onClick=\{onComplete\}/)
 assert.match(c,/disabled=\{!loaded\}/)
 assert.match(c,/Letzte Runde korrigieren/)
 assert.match(c,/Nach dieser Runde/)
 assert.match(c,/Gel Buddy noch nicht geladen/)
 assert.match(c,/role="alert"/)
 assert.match(c,/role="status"/)
 assert.doesNotMatch(c,/\bkm\b|\bKilometer\b|\bPace\b|\bZeitpuffer\b|\bRückstand\b|\bVorsprung\b/)
 assert.doesNotMatch(model,/gpsDistance|gpsKm|distanceKm|supabase|fetch\(/)
 const first=buildRunnerFocus({checkpoints:plan,completed:0})
 const third=buildRunnerFocus({checkpoints:plan,completed:2})
 assert.equal(first.nextIndex,1)
 assert.equal(first.remaining,19)
 assert.equal(third.longPause,true)
 assert.equal(third.nextIndex,3)
})
test('no unnecessary runner-mode intro and notices remain safe',()=>{
 const strategy=read('src/components/RaceStrategyCard.tsx')
 const focus=read('src/components/RaceRunnerFocus.tsx')
 assert.doesNotMatch(strategy,/heute zählt nur die nächste Runde/)
 assert.match(strategy,/<RaceDayCockpit active=\{active\}/)
 assert.match(focus,/<details className="rrf-footer">/)
 assert.match(focus,/Rundenspeicher nicht bereit/)
 assert.match(focus,/Koffein:/)
 assert.match(focus,/view\.nextAid/)
})

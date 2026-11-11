import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {explainRaceGust} from '../src/lib/raceWindExplain.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('30 km/h peak gust: manageable for a runner, not a storm claim',()=>{
 const x=explainRaceGust(30,0)
 assert.equal(x.label,'Gut beherrschbar')
 assert.equal(x.tone,'calm')
 assert.match(x.guidance,/Auf freien Abschnitten spürbar/)
 assert.match(x.guidance,/Geh- und Versorgungspausen/)
})
test('wind categories react to DWD-like gust thresholds, do not conflate with average wind',()=>{
 assert.equal(explainRaceGust(34,12).tone,'calm')
 assert.equal(explainRaceGust(35,12).tone,'notice')
 assert.equal(explainRaceGust(50,12).tone,'notice')
 assert.equal(explainRaceGust(51,12).tone,'caution')
 assert.equal(explainRaceGust(64,12).tone,'caution')
 assert.equal(explainRaceGust(65,12).tone,'warning')
 assert.equal(explainRaceGust(90,12).label,'Sehr starke Sturmböen')
 assert.equal(explainRaceGust(NaN,0),null)
})
test('wind at low temperature gets extra cold-weather guidance without fake chill number',()=>{
 const cold=explainRaceGust(30,3),warm=explainRaceGust(30,15)
 assert.match(cold.guidance,/Windschutz/)
 assert.doesNotMatch(warm.guidance,/Windschutz/)
 assert.doesNotMatch(cold.guidance,/gefühlte Temperatur.*°C/)
})
test('Race Prep shows wind meaning beside max gust, not a synthetic score',()=>{
 const ui=read('src/components/RaceForecastCompact.tsx')
 const css=read('src/styles/race-forecast-compact.css')
 assert.match(ui,/explainRaceGust\(info\.gust,info\.temp\?\.\[0\]\?\?null\)/)
 assert.match(ui,/rfc-wind-label/)
 assert.match(ui,/windAssessment\.label/)
 assert.match(ui,/Wind beim Laufen:/)
 assert.match(css,/rfc-wind-explanation/)
 assert.match(css,/rfc-wind-label/)
})

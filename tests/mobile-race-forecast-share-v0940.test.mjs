import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {raceForecastStatus,formatRaceWeatherShare} from '../src/lib/raceForecastShare.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('forecast confidence never labels a forecast as guaranteed or observed',()=>{
 assert.equal(raceForecastStatus('2026-11-15','2026-11-12',true).label,'Relativ belastbare Prognose')
 assert.equal(raceForecastStatus('2026-11-16','2026-11-12',true).label,'Vorläufige Prognose')
 assert.equal(raceForecastStatus('2026-11-21','2026-11-12',true).label,'Früher Wettertrend')
 assert.equal(raceForecastStatus('2026-11-15','2026-11-12',false).label,'Stundenprognose fehlt')
 assert.equal(raceForecastStatus('2026-11-11','2026-11-12',true).label,'Rennen vorbei')
 assert.equal(raceForecastStatus('2026-11-12','2026-11-12',true).days,0)
 assert.equal(raceForecastStatus('2026-03-01','2026-02-28',true).days,1)
})
test('share message includes the actual date, forecast status, countdown and actionable advice',()=>{
 const output=formatRaceWeatherShare({
  race:{race_name:'Hermannslauf',race_date:'2026-11-16',race_start_time:'11:00'},
  info:{temp:[1,11],rain:70,gust:45,changes:['Regen möglich','Windböen beachten','Kältephasen']},
  status:raceForecastStatus('2026-11-16','2026-11-12',true),
  place:'Detmold',finish:'Bielefeld',pointToPoint:true,
  fetchedAt:1794472800000,
  stages:[{label:'Start',weather:{hour:11,temperature:1,rainProbability:70,gust:45}},
   {label:'Ziel',weather:{hour:14,temperature:9,rainProbability:25,gust:30}}]
 })
 for(const required of ['Noch 4 Tage','Hermannslauf','16.11.2026','11:00 Uhr','Detmold → Bielefeld',
  'Vorläufige Prognose','1–11 °C','70 %','45 km/h','Regen','Start · 11:00 Uhr','Ziel · 14:00 Uhr','Open-Meteo']){
  assert.ok(output.includes(required),'missing: '+required)
 }
 assert.doesNotMatch(output,/garantiert sicher/)
})
test('race weather share is only offered with a complete forecast',()=>{
 const panel=read('src/components/RaceForecastCompact.tsx')
 const css=read('src/styles/race-forecast-compact.css')
 const icons=read('src/components/Icon.tsx')
 assert.match(panel,/raceForecastStatus\(race\?\.race_date/)
 assert.match(panel,/\{info&&race&&<button/)
 assert.match(panel,/navigator\.share/)
 assert.match(panel,/https:\/\/wa\.me\/\?text=/)
 assert.match(panel,/role="status"/)
 assert.match(css,/\.rfc-head-side/)
 assert.match(icons,/"share-2":/)
})

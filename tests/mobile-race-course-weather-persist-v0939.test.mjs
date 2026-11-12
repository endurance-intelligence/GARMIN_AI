import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {checkpointsFromTrack,stageWeatherAt} from '../src/lib/raceCourseWeather.mjs'
import {parseEventPages} from '../supabase/functions/_shared/race-event-extract.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('point-to-point track samples actual geometry, not arbitrary city-center weather',()=>{
 const pts=[[51.93,8.88],[51.94,8.92],[51.95,8.96],[51.96,9.00],[51.97,9.04]]
 const list=checkpointsFromTrack(pts)
 assert.equal(list.length,5)
 assert.deepEqual(list.map(x=>x.fraction),[0,.25,.5,.75,1])
 assert.equal(list[0].latitude,pts[0][0])
 assert.equal(list[4].longitude,pts[4][1])
 assert.equal(list[2].label,'Streckenmitte')
 assert.ok(list.every((v,i)=>i===0||v.km>=list[i-1].km))
 assert.equal(checkpointsFromTrack([[51.93,8.88]]).length,0)
})
test('weather uses estimated passage time, not start-hour forecast for finish',()=>{
 const start=1794736800
 const forecast={hours:Array.from({length:12},(_,i)=>({epoch:start+i*3600,temperature:i}))}
 assert.equal(stageWeatherAt(forecast,start,0,4).temperature,0)
 assert.equal(stageWeatherAt(forecast,start,.5,4).temperature,2)
 assert.equal(stageWeatherAt(forecast,start,1,4).temperature,4)
 assert.equal(stageWeatherAt(forecast,start,1,20),null)
})
test('organizer clearly marked point-to-point is identified, finish is not invented',()=>{
 const result=parseEventPages([{url:'https://example.org/rennen',html:
  '<h1>Testlauf</h1><p>Ein Punkt-zu-Punkt Lauf von Detmold nach Bielefeld.</p><p>Startort: Hermannsdenkmal</p><p>Zielort: Sparrenburg</p>'}])
 assert.equal(result.details.courseType,'point_to_point')
 assert.equal(result.details.venue,'Hermannsdenkmal')
 assert.equal(result.details.finishVenue,'Sparrenburg')
 assert.equal(result.details.finishCity,null)
 assert.equal(result.details.finishAddress,null)
})
test('owner-reviewed event model keeps extra finish fields in JSONB, never alters coach target',()=>{
 const api=read('supabase/functions/garmin-race-research/index.ts')
 assert.match(api,/finishVenue','finishCity','finishAddress/)
 assert.match(api,/allowedCourseTypes/)
 assert.match(api,/fields.courseType!=='point_to_point'/)
 assert.match(api,/input.confirm!==true/)
 assert.match(api,/trainingGoalChanged:false,garminChanged:false,intervalsChanged:false/)
})
test('point-to-point UI has independent start and destination inputs and correct weather scope',()=>{
 const scout=read('src/components/RaceEventResearch.tsx')
 const weather=read('src/components/RaceForecastCompact.tsx')
 const page=read('src/pages/RacePage.tsx')
 assert.match(scout,/Punkt zu Punkt \(Start ≠ Ziel\)/)
 assert.match(scout,/finishAddressInput/)
 assert.match(scout,/Startstadt/)
 assert.match(scout,/Zielstadt/)
 assert.match(scout,/onCourseChange/)
 assert.match(page,/routePoints=\{routePoints\}/)
 assert.match(page,/onTrack=\{setRoutePoints\}/)
 assert.match(weather,/checkpointsFromTrack\(routePoints\)/)
 assert.match(weather,/stageWeatherAt/)
 assert.match(weather,/Zwei Ortsprognosen/)
 assert.match(weather,/Zwischenstrecke ohne GPX nicht bewertet/)
 assert.match(weather,/5 reale Streckenpunkte/)
 assert.match(weather,/Keine Stadtprognose als Gesamtstreckenwetter ausgegeben/)
})
test('scout draft and navigation survives tab switching and browser reload without storing tokens',()=>{
 const scout=read('src/components/RaceEventResearch.tsx')
 const app=read('src/App.tsx')
 assert.match(scout,/sessionStorage.setItem\(cacheKey\(goal.raceDate\)/)
 assert.match(scout,/const draft=readDraft\(result.goal.raceDate\)/)
 assert.match(scout,/initializedGoal.current!==result.goal.raceDate/)
 assert.doesNotMatch(scout,/setGoal\(null\);setSaved\(\[\]\);setArchive\(\[\]\);setScan\(null\)/)
 assert.match(app,/sessionStorage.getItem\('garmin-ai:last-page:v1'\)/)
 assert.match(app,/sessionStorage.setItem\('garmin-ai:last-page:v1',next\)/)
 assert.doesNotMatch(scout,/sessionStorage.setItem\([^)]*,session\.access_token/)
})
test('3 compact weather metric cards include distinct icons and wind context',()=>{
 const weather=read('src/components/RaceForecastCompact.tsx')
 const css=read('src/styles/race-forecast-compact.css')
 const icons=read('src/components/Icon.tsx')
 for(const name of ['thermometer','droplets','wind']){
  assert.match(weather,new RegExp('Icon name="'+name+'"'))
  assert.match(icons,new RegExp('"'+name+'":'))
 }
 assert.match(css,/\.rfc-summary>\.rfc-metric/)
 assert.match(css,/padding:9px 12px/)
 assert.match(weather,/windAssessment\.guidance/)
})

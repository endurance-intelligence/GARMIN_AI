import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 parseForecast,bestTrainingSlot,raceSegments,localParts,
 validPlace,weatherLabel
} from '../src/lib/weatherIntelligence.ts'
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const place={name:'Teststadt',latitude:50,longitude:9}
function weather(days=2){
 const epoch=Date.parse('2026-11-10T00:00:00Z')/1000
 const count=24*days
 const hours=Array.from({length:count},(_,i)=>epoch+i*3600)
 return {
  timezone:'UTC',hourly:{
   time:hours,
   temperature_2m:hours.map(()=>14),
   apparent_temperature:hours.map(()=>12),
   precipitation_probability:hours.map((_,i)=>i%24===17?5:90),
   precipitation:hours.map((_,i)=>i%24===17?0:2.5),
   wind_speed_10m:hours.map(()=>14),
   wind_gusts_10m:hours.map((_,i)=>i%24===17?10:39),
   weather_code:hours.map(()=>3),
   is_day:hours.map((_,i)=>i%24>=7&&i%24<18?1:0),
   relative_humidity_2m:hours.map(()=>70)
  }
 }
}
const now=Date.parse('2026-11-09T09:00:00Z')
test('strict coordinates, no phantom location or malformed values',()=>{
 assert.equal(validPlace(place),true)
 assert.equal(validPlace({...place,latitude:900}),false)
 assert.equal(validPlace({...place,name:''}),false)
 assert.equal(weatherLabel(95),'Gewitter')
 assert.throws(()=>parseForecast({timezone:'UTC',hourly:{}},place))
})
test('forecast correctly normalizes unix timestamps and hourly evidence',()=>{
 const report=parseForecast(weather(),place,now)
 assert.equal(report.hours.length,48)
 assert.equal(report.timezone,'UTC')
 assert.equal(report.hours[17].hour,17)
 assert.equal(report.hours[17].date,'2026-11-10')
})
test('training without fixed time prefers the least wet daytime hour',()=>{
 const report=parseForecast(weather(),place,now)
 const selected=bestTrainingSlot(report,'2026-11-10',60,now)
 assert.ok(selected)
 assert.equal(selected.startHour,17)
 assert.equal(selected.level,'günstig')
 assert.equal(selected.weatherOnly,true)
 assert.match(selected.reason,/wenig Regen/)
})
test('longer training checks every hour, not just start conditions',()=>{
 const raw=weather()
 raw.hourly.precipitation[16]=0
 raw.hourly.precipitation_probability[16]=5
 raw.hourly.wind_gusts_10m[16]=10
 raw.hourly.precipitation[17]=2.5
 raw.hourly.precipitation_probability[17]=90
 raw.hourly.wind_gusts_10m[17]=39
 const report=parseForecast(raw,place,now)
 const first=bestTrainingSlot(report,'2026-11-10',60,now)
 const second=bestTrainingSlot(report,'2026-11-10',120,now)
 assert.equal(first.startHour,16)
 assert.ok(second)
 assert.notEqual(second.level,'günstig')
})
test('no past slots or invented forecast beyond available horizon',()=>{
 const report=parseForecast(weather(1),place,now)
 assert.equal(bestTrainingSlot(report,'2026-11-10',60,Date.parse('2026-11-11T03:00:00Z')),null)
 assert.equal(bestTrainingSlot(report,'2026-12-24',60,now),null)
 assert.equal(raceSegments(report,'2026-12-24',9,15),null)
})
test('race segments span midnight without selecting an alternative start time',()=>{
 const report=parseForecast(weather(),place,now)
 const race=raceSegments(report,'2026-11-10',19,15)
 assert.ok(race)
 assert.equal(race.complete,true)
 assert.deepEqual(race.segments.map(x=>x.hour),[19,22,1,4,7])
})
test('local timezone conversion remains correct around German DST switch',()=>{
 const before=localParts(Date.parse('2026-03-29T00:00:00Z')/1000,'Europe/Berlin')
 const after=localParts(Date.parse('2026-03-29T01:00:00Z')/1000,'Europe/Berlin')
 assert.equal(before.hour,1)
 assert.equal(after.hour,3)
 assert.equal(before.date,after.date)
})
test('weather is opt-in and weather-only, never a fake Garmin sync',()=>{
 const component=read('src/components/WeatherPanel.tsx')
 const source=read('src/lib/weatherIntelligence.ts')
 assert.match(component,/navigator.geolocation.getCurrentPosition\(/)
 assert.match(component,/onClick=\{currentLocation\}/)
 assert.match(component,/getWeather\(place,force\)/)
 assert.match(component,/localStorage.setItem\(key/)
 assert.match(component,/Wetterbasierter Vergleich, keine Trainingsfreigabe/)
 assert.match(source,/const HALF_HOUR=30\*60\*1000/)
 assert.match(source,/set\('forecast_days',String\(FORECAST_MAX_DAYS\)\)/)
 assert.match(source,/set\('timeformat','unixtime'\)/)
 assert.match(component,/https:\/\/open-meteo.com\//)
 assert.doesNotMatch(component,/service_role|GARMIN_API_KEY|scheduleWorkout\(/)
})
test('real weather cards are used on Coach, Calendar and Race',()=>{
 assert.match(read('src/pages/CoachPage.tsx'),/<CoachTodayWeather active=\{active\}\/>/)
 assert.match(read('src/pages/CalendarPage.tsx'),/selectedDate=\{selected\}/)\n assert.match(read('src/components/CalendarWeekBoard.tsx'),/<FixedTrainingWeather active=\{active\}/)
 assert.match(read('src/pages/RacePage.tsx'),/<WeatherPanel active=\{active\} mode="race"\/>/)
 assert.match(read('src/App.tsx'),/<OnlineAccessGate>/)
})

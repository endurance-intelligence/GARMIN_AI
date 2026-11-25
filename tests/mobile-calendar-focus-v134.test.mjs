import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {normalizeGarminRpe} from '../src/lib/garminPerception.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('calendar prioritizes week and day before optional controls, errors and race remain visible',()=>{
 const s=read('src/pages/CalendarPage.tsx')
 const positions=['<CalendarWeekBoard active={active}','className="hc-day-content"','setShowDayEvidence(event.currentTarget.open)','setShowWorkoutArchive(event.currentTarget.open)']
 for(let i=1;i<positions.length;i++)assert.ok(s.indexOf(positions[i])>s.indexOf(positions[i-1]),positions[i])
 assert.ok(s.indexOf('{error&&<p className="hc-error"')<s.indexOf('<CalendarWeekBoard'))
 assert.ok(s.indexOf('{raceInWeek&&')<s.indexOf('<CalendarWeekBoard'))
 assert.doesNotMatch(s,/hc-week-planner|hc-source-details/)
 assert.match(s,/<p>\{coachPreview.reason\}<\/p>/)
})
test('four completed weeks and race portfolio as in Coach, refresh updates board',()=>{
 const s=read('src/pages/CalendarPage.tsx')
 assert.match(s,/loadCoachSnapshot\(session,today,controller.signal,start,4\)/)
 assert.match(s,/racePortfolio:coachSnapshot.racePortfolio/)
 assert.match(s,/refreshKey=\{refresh\}/)
 const b=read('src/components/CalendarWeekBoard.tsx')
 assert.match(b,/\[active,start,refreshKey\]/)
 assert.match(b,/data\?\.start===start\?data:null/)
 assert.match(b,/setData\(null\);setOptions\(\[\]\);setChoices\(\[\]\)/)
})
test('Garmin RPE normalized; missing data not a zero week; walking excluded from run mileage',()=>{
 assert.equal(normalizeGarminRpe(70),7)
 assert.equal(normalizeGarminRpe(null),null)
 const s=read('src/components/CalendarWeekBoard.tsx')
 assert.match(s,/RPE \{normalizeGarminRpe\(activity.rpe_raw\)\}\/10/)
 assert.doesNotMatch(s,/RPE \{activity.rpe_raw\}/)
 assert.match(s,/!visibleData\?'–'/)
 assert.doesNotMatch(s,/treadmill\|walking/)
})

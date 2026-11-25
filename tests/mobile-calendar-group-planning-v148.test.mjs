import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('attendance management is opened on demand for the visible week',()=>{
 const p=read('src/pages/CalendarPage.tsx')
 assert.match(p,/onClick=\{openGroupWeek\}/)
 assert.match(p,/el\.showModal\(\)/)
 assert.match(p,/<dialog className="hc-group-dialog"/)
 assert.match(p,/showWeekOptions&&<WeeklyTrainingOptions active=\{active&&showWeekOptions\} weekStart=\{start\}/)
 assert.doesNotMatch(p,/id="calendar-group-week"/)
})
test('past slots remain visible but are read-only; coach refresh does not reuse another week',()=>{
 const s=read('src/components/WeeklyTrainingOptions.tsx'),p=read('src/pages/CalendarPage.tsx')
 assert.match(s,/items.filter\(option=>option.enabled\)/)
 assert.match(s,/visibleRows=rows.filter\(row=>!selectedDate/)
 assert.match(s,/actualWeek===weekStart&&completedWeeklyOption/)
 assert.match(s,/!old&&!completed&&!loading/)
 assert.match(s,/date<today\)return/)
 assert.match(s,/response.saved!==true/)
 assert.match(s,/garmin-ai-weekly-choice-changed/)
 assert.match(p,/setCoachSnapshot\(null\);setCoachLoading\(true\);setCoachReview\(null\);setRefresh/)
 assert.match(s,/coachLoading\?'Empfehlung wird aktualisiert/)
})
test('skipped slot is explicit and cannot look like an invitation or show irrelevant weather',()=>{
 const b=read('src/components/CalendarWeekBoard.tsx')
 assert.match(b,/choice==='skipped'\?'ABGESAGT \/ AUSGELASSEN'/)
 assert.match(b,/choice!=='skipped'&&<FixedTrainingWeather/)
 assert.match(b,/discouraged&&!selected&&choice!=='skipped'/)
 assert.match(b,/is-confirmed-group/)
 assert.match(b,/x.enabled!==false/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {calendarDay,canMoveCalendarPlan,validCalendarMove} from '../src/lib/calendarMove.mjs'
const today='2026-11-27',plan={training_date:'2026-11-29',state:'draft',intervals_sync_status:'not_published'}
test('only local future definitely unsent plans can change dates',()=>{
 assert.equal(calendarDay('2026-02-30'),false)
 assert.equal(validCalendarMove(plan,today,'2026-11-28'),true)
 assert.equal(validCalendarMove({...plan,state:'pending'},today,'2026-11-28'),true)
 for(const patch of [{state:'confirmed'},{state:'sending'},{state:'cancelled'},{intervals_event_id:4},{intervals_published_revision:1},{intervals_sync_status:'needs_review'},{intervals_sync_status:'confirmed'},{garmin_workout_id:1},{garmin_remote_id:5},{confirmed_at:today},{training_date:'2026-11-26'}])assert.equal(canMoveCalendarPlan({...plan,...patch},today),false)
 for(const target of ['2026-11-29','2026-11-26','2026-02-30','2027-02-01'])assert.equal(validCalendarMove(plan,today,target),false)
})
test('move is revision guarded, preserves the same row, requires renewed approval, and cannot race a first export',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const api=read('supabase/functions/garmin-training-plan/index.ts'),remote=read('supabase/functions/garmin-intervals/index.ts'),page=read('src/pages/CalendarPage.tsx')
 const move=api.slice(api.indexOf("if(input.action==='move')"),api.indexOf("if(input.action==='approve'"))
 assert.match(move,/\.update\(\{training_date:target,state:'draft',approved_at:null/)
 assert.match(move,/\.eq\('revision',input.revision\)/)
 assert.match(move,/\.eq\('intervals_sync_status','not_published'\)/)
 assert.doesNotMatch(move,/\.insert\(|\.delete\(|fetch\(/)
 assert.match(remote,/\.update\(\{intervals_sync_status:'needs_review'\}\)\.eq\('id',plan.id\)\.eq\('revision',plan.revision\)/)
 assert.match(page,/action:'move',id:plan.id,revision:plan.revision,date:target/)
 assert.match(page,/setCoachSnapshot\(null\);setCoachLoading\(true\);setRefresh/)
 assert.match(read('src/styles/calendar-week-board.css'),/\.hwb-day\{display:grid;grid-template-columns:60px minmax\(0,1fr\)/)
})

test('agenda and day-detail navigation share the phone/tablet breakpoint, with wider tablet cards',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const css=read('src/styles/calendar-week-board.css'),page=read('src/pages/CalendarPage.tsx'),horizon=read('src/styles/horizon-calendar.css')
 assert.match(css,/\/\* Phone and tablet:[^\n]+\n@media\(max-width:1366px\)/)
 assert.match(css,/@media\(min-width:741px\) and \(max-width:1366px\)/)
 assert.match(css,/grid-template-columns:88px minmax\(0,1fr\)/)
 assert.match(horizon,/@media\(max-width:1366px\)/)
 assert.match(page,/matchMedia\('\(max-width:1366px\)'\)/)
})

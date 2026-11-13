import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildMovementPlan} from '../src/lib/movementSession.ts'
const src=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const board=src('src/components/CalendarWeekBoard.tsx')
const calendar=src('src/pages/CalendarPage.tsx')
const options=src('src/components/WeeklyTrainingOptions.tsx')
const remote=src('supabase/functions/garmin-intervals/index.ts')
const feed=src('supabase/functions/garmin-training-plan/index.ts')
const styles=src('src/styles/horizon-calendar.css')

test('expired ORC/football options disappear, real past Garmin activities stay',()=>{
 assert.match(board,/x\.weekday===index\+1&&day>=today&&/)
 assert.match(board,/\{acts\.map\(activity=>/)
 assert.match(options,/rows\.filter\(row=>row\.date>=today&&/)
 assert.match(board,/completedWeeklyOption\(x,day,acts\)/)
})
test('failed remote delete never strands user in the GARMIN_AI calendar',()=>{
 assert.match(remote,/input\.action==='delete_published'\|\|input\.action==='cleanup_published'/)
 assert.match(remote,/const cleanup=input\.action==='cleanup_published'/)
 assert.match(remote,/state:'cancelled',revision:plan\.revision\+1/)
 assert.match(remote,/intervals_sync_status:remoteRemoved\?'not_published':'needs_review'/)
 assert.match(remote,/remoteRemovalPending:!remoteRemoved/)
 assert.match(remote,/existing\.external_id!=='garmin-ai:'\+plan\.id/)
 assert.match(remote,/await intervals\('DELETE','\/athlete\/0\/events\/'/)
 assert.match(feed,/intervals_sync_status,intervals_export_version,created_at/)
 assert.match(calendar,/setPlans\(old=>old\.map\(p=>p\.id===plan\.id/)
 assert.match(calendar,/cleanupPending=plans\.filter/)
 assert.match(calendar,/action:'cleanup_published'/)
 assert.match(calendar,/Bei Intervals\.icu abgleichen/)
 assert.match(calendar,/Die Löschung bei Intervals\.icu konnte nicht bestätigt werden/)
 assert.doesNotMatch(remote,/\.from\('garmin_activities'\)\.delete\(/)
})
test('one confirmation panel at a time and owner approves all remote changes',()=>{
 assert.match(calendar,/setDeleteArmed\(plan\.id\);setRepairArmed\(null\)/)
 assert.match(calendar,/setRepairArmed\(plan\.id\);setDeleteArmed\(null\)/)
 assert.match(calendar,/deleteArmed!==plan\.id&&<>/)
 assert.match(remote,/user\.email_confirmed_at/)
 assert.match(remote,/input\.acknowledge!==true/)
})
test('weather is now inside fixed-time cards and selected day, not a generic best-slot banner',()=>{
 assert.doesNotMatch(calendar,/<WeatherPanel/)
 assert.match(calendar,/selectedDate=\{selected\}/)
 assert.match(board,/<FixedTrainingWeather active=\{active\}/)
 assert.match(options,/hourAt\(report,date,Number\(option\.start_time\.slice\(0,2\)\)\)/)
})
test('movement studio chooses variants per calendar day and stable manual rotation',()=>{
 const a=buildMovementPlan('2026-11-11',0),repeat=buildMovementPlan('2026-11-11',0)
 const nextDay=buildMovementPlan('2026-11-12',0),remix=buildMovementPlan('2026-11-11',1)
 assert.deepEqual(a,repeat)
 assert.notDeepEqual(a.strengthIds,nextDay.strengthIds)
 assert.notDeepEqual(a.strengthIds,remix.strengthIds)
 for(const p of [a,nextDay,remix]){
  assert.equal(p.minutes,30)
  assert.equal(p.steps.reduce((sum,s)=>sum+s.workSeconds+s.restSeconds,0),1800)
 }
 assert.match(src('src/lib/movementSession.ts'),/86400000\)/)
})

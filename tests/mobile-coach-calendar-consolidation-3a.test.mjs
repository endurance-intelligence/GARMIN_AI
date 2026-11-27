import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const calendar=read('src/pages/CalendarPage.tsx')
const coach=read('src/components/CoachSevenDay.tsx')
test('one full review route within the quick-decision horizon; later simple drafts retain the existing path',()=>{
 assert.match(calendar,/const canReviewSelected=selected>=today&&selected<=moveDay\(today,13\)/)
 assert.match(calendar,/&&canReviewSelected&&/)
 assert.match(calendar,/!alternative&&selected>=today&&!canReviewSelected&&/)
 assert.match(calendar,/action==='choose'\)\{onOpenCoach\(day.date\)/)
 assert.match(calendar,/await acceptCoach\(day,true\)/)
})
test('decision dialog uses verified selected calendar week and exact date, not a fallback day',()=>{
 assert.match(calendar,/snapshotStart===start&&!!coachPlan\?\.days.some\(d=>d.date===decisionFocus\?\.date\)/)
 assert.match(calendar,/reviewStart=\{planStart\} snapshotWeek=\{start\}/)
 assert.match(coach,/today,startDate:reviewStart,health:snapshot.health/)
 assert.match(coach,/loadCoachSnapshot\(session,today,undefined,snapshotWeek,4\)/)
 assert.match(coach,/today,startDate:reviewStart,health:fresh.health/)
 assert.match(coach,/if\(singleDay&&focus&&!plan\?\.days.some\(day=>day.date===focus.date\)\)return/)
 assert.match(coach,/!singleDay&&<WeeklyTrainingCard/)
})
test('draft, approval, publication and repair remain explicit separate actions',()=>{
 for(const action of ['create_coach_workout','approve','publish'])assert.ok(calendar.includes("action:'"+action+"'"))
 assert.match(calendar,/onClick=\{\(\)=>void approvePlan\(plan\)\}/)
 assert.match(calendar,/onClick=\{\(\)=>void publishPlan\(plan\)\}/)
 assert.match(coach,/Keine automatische Garmin-Übertragung/)
})

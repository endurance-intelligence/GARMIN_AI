import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {makePlanSnapshot,historyModel} from '../src/lib/trainingHistory.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('calendar notes preserve explicitly recorded cross training duration after acceptance',()=>{
 const p=makePlanSnapshot({today:'2026-11-26',budget:{start:'2026-11-23',phaseLabel:'Erholung',target:null,paceSeconds:360,proposedParts:[]},plans:[{training_date:'2026-11-27',sport:'other',title:'Rudern',state:'confirmed',notes:'Coach-Alternative · 20 Min. · Locker'},{training_date:'2026-11-28',sport:'strength',title:'Stabi',state:'draft',notes:'Coach Intelligence · 15 Min.'}]})
 assert.deepEqual(p.entries.map(e=>[e.kind,e.minutes,e.source]),[['rowing',20,'approved'],['strength',15,'draft']])
 const m=historyModel({month:'2026-11',today:'2026-11-26',revisions:[{id:'a',created_at:'2026-11-26T12:00:00Z',week_start:p.weekStart,snapshot:p}]})
 assert.equal(m.planned.minutes,35)
})
test('central rhythm migrates only if no saved profile, and a failed request is not replaced by browser defaults',()=>{
 const api=read('src/lib/trainingHistoryApi.ts'),edge=read('supabase/functions/garmin-training-history/index.ts')
 assert.match(api,/if\(result.rhythm!==null\)return checkedRhythm/)
 assert.match(api,/action:'migrate'/)
 assert.match(edge,/ignoreDuplicates:body.action==='migrate'/)
 assert.match(edge,/eq\('user_id',user.id\)/)
 assert.match(read('src/lib/coachSnapshot.ts'),/loadTrainingRhythm\(signal\)/)
 assert.doesNotMatch(read('src/lib/coachSnapshot.ts'),/readRhythm\(\)/)
})
test('current week archives from both active pages, no approval or dispatch',()=>{
 const a=read('src/components/TrainingWeekArchive.tsx')
 assert.match(a,/if\(!active\)return/)
 assert.match(a,/saveTrainingWeek\(snapshot,crypto.randomUUID\(\)\)/)
 assert.doesNotMatch(a,/approvePlan|publishPlan|garmin-training-plan/)
 assert.match(read('src/pages/CalendarPage.tsx'),/archiveSnapshot&&week===0&&/)
 assert.match(read('src/pages/CoachPage.tsx'),/archiveSnapshot&&!snapshotLoading&&!snapshotError&&/)
 const sql=read('supabase/migrations/20261126131338_planning_consolidation_rhythm_archive.sql')
 assert.match(sql,/pg_advisory_xact_lock/)
 assert.match(sql,/prior.snapshot=p_snapshot/)
 assert.match(sql,/\(e->>'date'\)::date<d/)
 assert.match(sql,/security invoker/)
 assert.doesNotMatch(sql,/update public.garmin_weekly_plan_history/i)
})

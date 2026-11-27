import test from 'node:test'
import assert from 'node:assert/strict'
import {split200Text,withSplitNote} from '../src/lib/workoutSplitNotes.ts'
import {extensiveSaturdayFlyer} from '../src/lib/extensiveSaturdayFlyer.ts'
import {validateTrainerWorkout} from '../supabase/functions/_shared/workout-archive-schema.mjs'
test('200m cumulative splits are deterministic and preserve handwritten comments',()=>{
 const step={kind:'run',distanceMeters:1000,paceSecondsPerKm:275,notes:'I7'}
 assert.equal(split200Text(step),'200-m-Splits: 55 – 1:50 – 2:45 – 3:40 – 4:35')
 assert.match(withSplitNote(step).notes,/^I7 \| 200-m-Splits/)
 const manual={...step,notes:'I7 || 55 – 1:50 – 2:45 – 3:40 – 4:35'}
 assert.deepEqual(withSplitNote(manual),manual)
 assert.equal(split200Text({...step,paceSecondsPerKm:null}),'')
})
test('explicit extensive Saturday reference preserves all five source groups and drink break',()=>{
 const w=extensiveSaturdayFlyer()
 assert.ok(validateTrainerWorkout(w))
 assert.equal(w.warmup.distanceMeters,2000)
 assert.deepEqual(w.groups.map(g=>g.steps.filter(s=>s.kind==='run').length),[8,7,6,6,5])
 assert.deepEqual(w.groups.map(g=>g.steps.find(s=>s.kind==='run').paceSecondsPerKm),[255,275,295,315,335])
 for(const g of w.groups){
  assert.equal(g.steps.filter(s=>s.durationSeconds===60&&s.kind==='recovery').length,1)
  assert.equal(g.steps.filter(s=>s.kind==='recovery'&&s.distanceMeters===200).length,g.steps.filter(s=>s.kind==='run').length-2)
 }
})

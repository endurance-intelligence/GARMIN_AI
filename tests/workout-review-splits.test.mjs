import test from 'node:test'
import assert from 'node:assert/strict'
import {split200Text,numberedStepComments,withNumberedSplitNotes} from '../src/lib/workoutSplitNotes.ts'
import {extensiveSaturdayFlyer} from '../src/lib/extensiveSaturdayFlyer.ts'
import {validateTrainerWorkout} from '../supabase/functions/_shared/workout-archive-schema.mjs'
test('1000m has exactly five cumulative 200m marks; recovery and drink break are distinct',()=>{
 const run={kind:'run',distanceMeters:1000,durationSeconds:null,paceSecondsPerKm:275,notes:'I7 || 55 – 1:50 – 2:45 – 3:40 – 4:35'}
 const jog={kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:300,notes:'zügig'}
 const drink={kind:'recovery',distanceMeters:null,durationSeconds:60,paceSecondsPerKm:null,notes:'Trinkpause'}
 const steps=[run,jog,run,drink,run,jog]
 const expected=['L1: 0:55 | 1:50 | 2:45 | 3:40 | 4:35','T1: 1:00','L2: 0:55 | 1:50 | 2:45 | 3:40 | 4:35','Trinkpause: 1:00','L3: 0:55 | 1:50 | 2:45 | 3:40 | 4:35','T2: 1:00']
 assert.deepEqual(numberedStepComments(steps),expected)
 const saved=withNumberedSplitNotes(steps)
 assert.deepEqual(saved.map(s=>s.notes),expected.map((s,i)=>i===1||i===5?s+' · zügig':s))
 assert.deepEqual(withNumberedSplitNotes(saved),saved)
 assert.equal(withNumberedSplitNotes([{...saved[0],paceSecondsPerKm:295}])[0].notes,'L1: 0:59 | 1:58 | 2:57 | 3:56 | 4:55')
 assert.equal(split200Text({...run,paceSecondsPerKm:null}),'')
 assert.equal(split200Text({...run,distanceMeters:400}),'0:55 | 1:50')
 assert.equal(split200Text({...run,distanceMeters:1600}).split(' | ').length,8)
 assert.equal(withNumberedSplitNotes([{...run,notes:'Kontrolliert'}])[0].notes,expected[0]+' · Kontrolliert')
 assert.equal(numberedStepComments([{...jog,paceSecondsPerKm:null,durationSeconds:60}])[0],'T1: 1:00')
 assert.equal(numberedStepComments([{...jog,paceSecondsPerKm:null}])[0],'T1: Zeit offen')
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

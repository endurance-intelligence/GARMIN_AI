import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {previousOrcFlyer} from '../src/lib/workoutLibrary.ts'
import {makeTrackLapGuide,splitClock,lapStepSummary} from '../src/lib/trackLapGuide.ts'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('all 5 human-reviewed trainer groups are available for selection in one archive item',()=>{
 const poster=previousOrcFlyer()
 assert.deepEqual(poster.groups.map(g=>g.name),['Fuchs','Wolf','Tiger','Bären','Capybara'])
 for(const g of poster.groups){
  const cues=makeTrackLapGuide(poster,g.name)
  assert.equal(cues[0].type,'warmup')
  assert.equal(cues.at(-1).type,'cooldown')
  assert.ok(cues.some(c=>c.type==='run'))
  assert.ok(cues.every(c=>c.end==='lap'))
 }
})
test('Wolf has 3+3+2 and every step advances on real track marking, not GPS metres',()=>{
 const cues=makeTrackLapGuide(previousOrcFlyer(),'Wolf')
 const runs=cues.filter(s=>s.type==='run')
 assert.equal(cues.length,17)
 assert.equal(runs.length,8)
 assert.equal(cues.filter(s=>s.type==='recovery').length,7)
 assert.deepEqual(runs.map(s=>s.paceLabel),['4:20','4:10','4:30','4:20','4:10','4:30','4:20','4:10'])
 assert.deepEqual(runs.map(s=>s.block),[1,1,1,2,2,2,3,3])
 assert.deepEqual(runs.map(s=>s.withinBlock),[1,2,3,1,2,3,1,2])
 assert.equal(runs[0].fourHundredSeconds,104)
 assert.equal(runs[0].expectedSeconds,260)
 assert.equal(splitClock(104),'1:44')
 assert.match(lapStepSummary(runs[6]),/Satz 3\/3.*Intervall 7\/8.*1000 m.*4:20\/km/)
})
test('400 m and 800 m steps display real split targets, never GPS auto-completion',()=>{
 const w=structuredClone(previousOrcFlyer())
 const wolf=w.groups.find(x=>x.name==='Wolf')
 wolf.notes='2 + 1'
 wolf.steps=[
  {kind:'run',distanceMeters:400,durationSeconds:null,paceSecondsPerKm:240,notes:''},
  {kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:null,notes:''},
  {kind:'run',distanceMeters:800,durationSeconds:null,paceSecondsPerKm:260,notes:''},
  {kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:null,notes:''},
  {kind:'run',distanceMeters:400,durationSeconds:null,paceSecondsPerKm:250,notes:''}
 ]
 const cues=makeTrackLapGuide(w,'Wolf')
 const runs=cues.filter(s=>s.type==='run')
 assert.deepEqual(runs.map(s=>s.distanceMeters),[400,800,400])
 assert.deepEqual(runs.map(s=>s.expectedSeconds),[96,208,100])
 assert.deepEqual(runs.map(s=>s.block),[1,1,2])
 assert.ok(cues.every(s=>s.end==='lap'))
})
test('manual-LAP mode explicitly tells the user to advance at the track line',()=>{
 const p=read('src/components/TrackLapPreview.tsx')
 assert.match(p,/Bahnmodus · LAP an der Markierung/)
 assert.match(p,/per LAP/)
 assert.match(p,/GPS-Autostopp/)
 assert.match(p,/SATZ \{s.block\}\/\{s.blocks\} · INTERVALL \{s.repeat\}\/\{s.repeats\}/)
 assert.match(p,/Status: nur Vorschau/)
 assert.match(p,/noch nicht/)
 assert.match(p,/Lap Button Press/)
 assert.doesNotMatch(p,/scheduleWorkout\(|uploadWorkout\(|createWorkout\(/)
})
test('original template is gated by explicit user checkbox before replacing partial OCR',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(ui,/const \[referenceConfirmed,setReferenceConfirmed\]=useState\(false\)/)
 assert.match(ui,/if\(!referenceConfirmed\|\|!localPhotoUrl\|\|!ocrRaw\)return/)
 assert.match(ui,/begin\(previousOrcFlyer\(\),'trainer_photo',imageHash\)/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/nicht vollständig/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/Alle 5 Gruppen übernehmen/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/checked=\{referenceConfirmed\}/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/Deine Gruppe wählen/)
 assert.match(read('src/components/WorkoutReviewDialog.tsx'),/groupIndex===i/)
 assert.match(read('src/components/WorkoutFinishSelector.tsx'),/makeTrackLapGuide\(workout,group.name\)/)
 assert.match(ui,/onClick=\{\(\)=>viewRecord\(record,group\)\}/)
})
test('owner-controlled private archive and Garmin write restrictions unchanged',()=>{
 const ui=read('src/components/WorkoutArchivePanel.tsx')
 assert.match(ui,/action:'save',clientRequestId:requestId.current,reviewed:true/)
 assert.match(ui,/action:'plan',templateId:template.id,group,date/)
 assert.match(read('src/App.tsx'),/<OnlineAccessGate>/)
 assert.doesNotMatch(ui,/addWeighIn\(|scheduleWorkout\(|uploadWorkout\(/)
})

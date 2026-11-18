import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {previousOrcFlyer,blankStep,endModeFor} from '../src/lib/workoutLibrary.ts'
import {makeTrackLapGuide} from '../src/lib/trackLapGuide.ts'
import {applyFinishPreset,toWorkoutTransferDraft,workoutTransferInstructions,
 GARMIN_CUSTOM_WORKOUT_MAX_STEPS} from '../src/lib/workoutStepControls.ts'
import {validateTrainerWorkout} from '../supabase/functions/_shared/workout-archive-schema.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('legacy archived coach templates without endMode remain manual LAP',()=>{
 const legacy=previousOrcFlyer()
 delete legacy.warmup.endMode
 for(const group of legacy.groups)for(const step of group.steps)delete step.endMode
 const normalized=validateTrainerWorkout(legacy)
 assert.ok(normalized)
 assert.equal(normalized.warmup.endMode,'lap')
 assert.equal(normalized.groups[1].steps[0].endMode,'lap')
 assert.equal(endModeFor(legacy.groups[1].steps[0]),'lap')
 assert.ok(makeTrackLapGuide(legacy,'Wolf').every(cue=>cue.end==='lap'))
})
test('track preset and street preset apply to the selected group, not other groups',()=>{
 const w=previousOrcFlyer()
 const wolf=w.groups.findIndex(g=>g.name==='Wolf')
 const fuchs=w.groups.findIndex(g=>g.name==='Fuchs')
 const street=applyFinishPreset(w,wolf,'distance')
 assert.equal(street.updated,16) // 8 runs + 7 recoveries + warmup
 assert.equal(street.skipped,1) // no fixed cooldown distance
 assert.ok(w.groups[wolf].steps.every(s=>s.endMode==='distance'))
 assert.ok(w.groups[fuchs].steps.every(s=>s.endMode==='lap'))
 assert.equal(w.warmup.endMode,'distance')
 assert.equal(endModeFor(w.cooldown),'lap')
 const track=applyFinishPreset(w,wolf,'lap')
 assert.equal(track.updated,17)
 assert.equal(track.skipped,0)
 assert.ok(makeTrackLapGuide(w,'Wolf').every(x=>x.end==='lap'))
})
test('mixed mode is validated, persisted and reflected in the running step list',()=>{
 const w=previousOrcFlyer(),wolf=w.groups.find(g=>g.name==='Wolf')
 wolf.steps[0].endMode='lap'
 wolf.steps[1].endMode='distance'
 wolf.steps[2].endMode='distance'
 w.warmup.endMode='distance'
 const checked=validateTrainerWorkout(JSON.parse(JSON.stringify(w)))
 assert.ok(checked)
 const cues=makeTrackLapGuide(checked,'Wolf')
 assert.equal(cues[0].end,'distance')
 assert.equal(cues[1].end,'lap')
 assert.equal(cues[2].end,'distance')
 assert.equal(cues[3].end,'distance')
 assert.equal(cues[1].paceLabel,'4:20')
 const transfer=toWorkoutTransferDraft(checked,'Wolf')
 assert.equal(transfer.steps[1].duration.type,'lapButton')
 assert.deepEqual(transfer.steps[2].duration,{type:'distance',meters:200})
 assert.equal(transfer.status,'draft-not-uploaded')
 assert.ok(transfer.canFitGarmin)
})
test('distance finish without a specified distance is rejected by private archive',()=>{
 const w=previousOrcFlyer()
 w.cooldown.endMode='distance'
 assert.equal(validateTrainerWorkout(w),null)
 w.cooldown.endMode='lap'
 w.groups[0].steps[0].endMode='unknown'
 assert.equal(validateTrainerWorkout(w),null)
 w.groups[0].steps[0].endMode='lap'
 assert.ok(validateTrainerWorkout(w))
})
test('preset preserves trainer prescribed distances, paces, order and other groups',()=>{
 const w=previousOrcFlyer()
 const before=w.groups.map(g=>g.steps.map(s=>[s.kind,s.distanceMeters,s.paceSecondsPerKm]))
 applyFinishPreset(w,1,'distance')
 const after=w.groups.map(g=>g.steps.map(s=>[s.kind,s.distanceMeters,s.paceSecondsPerKm]))
 assert.deepEqual(after,before)
})
test('more than 50 Garmin steps are flagged rather than silently uploaded',()=>{
 const w=previousOrcFlyer()
 const wolf=w.groups.find(g=>g.name==='Wolf')
 wolf.steps=Array.from({length:51},()=>blankStep('run'))
 const spec=toWorkoutTransferDraft(w,'Wolf')
 assert.equal(GARMIN_CUSTOM_WORKOUT_MAX_STEPS,50)
 assert.equal(spec.canFitGarmin,false)
 assert.match(workoutTransferInstructions(w,'Wolf'),/Mehr als 50 Schritte/)
})
test('single clean iPhone popup offers whole-group presets and per-step select',()=>{
 const modal=read('src/components/WorkoutReviewDialog.tsx')
 const controls=read('src/components/WorkoutFinishSelector.tsx')
 const css=read('src/styles/workout-finish-selector.css')
 assert.match(modal,/<WorkoutFinishSelector/)
 assert.match(modal,/>Bahn \/ Distanz<\/button>/)
 assert.match(controls,/applyFinishPreset\(w,groupIndex,'lap'\)/)
 assert.match(controls,/applyFinishPreset\(w,groupIndex,'distance'\)/)
 assert.match(controls,/onChangeStep\(index-2/)
 assert.match(controls,/Schritt '\+cue.index\+' beenden mit/)
 assert.match(controls,/disabled=\{cue.distanceMeters===null\}/)
 assert.match(controls,/Garmin-Schritte kopieren/)
 assert.match(controls,/Noch kein Garmin-Upload/)
 assert.match(css,/@media\(max-width:760px\)/)
 assert.doesNotMatch(controls,/fetch\(|scheduleWorkout\(|createWorkout\(/)
})
test('server preserves mode and no Garmin writes are introduced',()=>{
 const server=read('supabase/functions/_shared/workout-archive-schema.mjs')
 assert.match(server,/const endMode=\(v\)=>v===undefined\?'lap'/)
 assert.match(server,/finish==='distance'&&dist===null/)
 assert.match(server,/paceSecondsPerKm:pace,notes:comment,endMode:finish/)
 const endpoint=read('supabase/functions/garmin-workout-archive/index.ts')
 assert.match(endpoint,/body.reviewed!==true/)
 assert.doesNotMatch(endpoint,/scheduleWorkout\(|uploadWorkout\(|addWeighIn\(/)
})

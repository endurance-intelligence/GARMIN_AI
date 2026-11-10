/** Local workout-step completion configuration; no Garmin API calls.
 * Trainer archive remains immutable: editing creates a new private revision.
 */
import type {TrainerWorkout,WorkoutEndMode} from './workoutLibrary.ts'
import {makeTrackLapGuide,lapStepSummary} from './trackLapGuide.ts'
export const GARMIN_CUSTOM_WORKOUT_MAX_STEPS=50
export function applyFinishPreset(workout:TrainerWorkout,groupIndex:number,mode:WorkoutEndMode){
 const group=workout.groups[groupIndex]
 if(!group)return {updated:0,skipped:0}
 let updated=0,skipped=0
 for(const step of [workout.warmup,...group.steps,workout.cooldown]){
  if(step.kind==='drill')continue
  if(mode==='distance'&&step.distanceMeters===null){skipped++;continue}
  step.endMode=mode
  updated++
 }
 return {updated,skipped}
}
/** For manual Garmin Connect entry or a future reviewed Garmin adapter.
 * 'lapButton'/'distance' here are INTERNAL names, not an undocumented Garmin API payload.
 */
export function toWorkoutTransferDraft(workout:TrainerWorkout,groupName:string){
 const cues=makeTrackLapGuide(workout,groupName)
 const steps=cues.map(cue=>({
  position:cue.index,
  kind:cue.type,
  description:lapStepSummary(cue),
  duration:cue.end==='distance'
   ?{type:'distance' as const,meters:cue.distanceMeters}
   :{type:'lapButton' as const},
  targetPaceSecondsPerKm:cue.paceSecondsPerKm,
  expectedSeconds:cue.expectedSeconds
 }))
 return {
  title:workout.title+' · '+groupName,
  status:'draft-not-uploaded' as const,
  maxGarminSteps:GARMIN_CUSTOM_WORKOUT_MAX_STEPS,
  canFitGarmin:steps.length<=GARMIN_CUSTOM_WORKOUT_MAX_STEPS,
  invalidDistanceSteps:steps.filter(s=>s.duration.type==='distance'&&
   (!s.duration.meters||s.duration.meters<20)).map(s=>s.position),
  steps
 }
}
export function workoutTransferInstructions(workout:TrainerWorkout,groupName:string):string{
 const w=toWorkoutTransferDraft(workout,groupName)
 const heading=w.title+'\nGarmin Connect: Training & Planung > Trainings > Training erstellen\n'+
  'Nur Anleitung – noch NICHT an Garmin gesendet.\n'
 const lines=w.steps.map(s=>
  String(s.position).padStart(2,'0')+'. '+s.description+
  (s.targetPaceSecondsPerKm!==null?' · Zielpace: '+
   Math.floor(s.targetPaceSecondsPerKm/60)+':'+
   String(s.targetPaceSecondsPerKm%60).padStart(2,'0')+' min/km':''))
 return heading+'\n'+lines.join('\n')+
  (w.canFitGarmin?'':'\nACHTUNG: Mehr als 50 Schritte – Garmin-Workout muss angepasst werden.')
}

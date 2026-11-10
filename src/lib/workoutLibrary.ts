import {buildOrcWorkout,ORC_GROUPS} from './orcTrackWorkout.ts'
import type {OrcGroup} from './orcTrackWorkout'
export type WorkoutStepKind='run'|'recovery'|'drill'|'warmup'|'cooldown'
export type TrainerStep={
 kind:WorkoutStepKind;distanceMeters:number|null;
 durationSeconds:number|null;paceSecondsPerKm:number|null;notes:string
}
export type TrainerSegment={distanceMeters:number|null;durationSeconds:number|null;notes:string}
export type TrainerGroup={name:string;notes:string;steps:TrainerStep[]}
export type TrainerWorkout={
 version:1;title:string;trainer:string;sourceLabel:string;
 warmup:TrainerSegment;cooldown:TrainerSegment;groups:TrainerGroup[]
}
export type ArchiveRecord={
 id:string;title:string;coach_name:string;source_label:string;
 source_kind:'trainer_photo'|'manual'|'orc_reference';
 source_image_sha256:string|null;workout:TrainerWorkout;created_at:string
}
export function formatPace(value:number|null):string{
 if(value===null||!Number.isInteger(value))return ''
 return Math.floor(value/60)+':'+String(value%60).padStart(2,'0')
}
export function parsePace(value:string):number|null{
 const t=value.trim()
 if(!t)return null
 if(!/^([2-9]|1[0-4]):[0-5][0-9]$/.test(t))return null
 const [m,s]=t.split(':').map(Number)
 const pace=60*m+s
 return pace>=120&&pace<=900?pace:null
}
export function blankStep(kind:WorkoutStepKind='run'):TrainerStep{
 return {kind,distanceMeters:kind==='run'?1000:kind==='recovery'?200:null,
  durationSeconds:null,paceSecondsPerKm:null,notes:''}
}
export function blankTrainerWorkout():TrainerWorkout{
 return {version:1,title:'',trainer:'',sourceLabel:'',
  warmup:{distanceMeters:null,durationSeconds:null,notes:''},
  cooldown:{distanceMeters:null,durationSeconds:null,notes:''},
  groups:[{name:'Gruppe 1',notes:'',steps:[blankStep()]}]}
}
/** Legacy ORC flyer becomes ONE reusable reviewed workout, not a weekly rule. */
export function previousOrcFlyer():TrainerWorkout{
 return {
  version:1,title:'Schwelle im Wechsel',
  trainer:'Oerlinghausen Runcrew',sourceLabel:'ORC Track Tuesday · Trainer-Grafik',
  warmup:{distanceMeters:2000,durationSeconds:null,
   notes:'Einlaufen + Übungen mit den Minibändern'},
  cooldown:{distanceMeters:null,durationSeconds:null,
   notes:'Locker auslaufen und anschließend dehnen'},
  groups:ORC_GROUPS.map((name:OrcGroup)=>{
   const w=buildOrcWorkout(name)
   const steps=w.steps.filter(s=>s.kind==='interval'||s.kind==='recovery')
    .map((s):TrainerStep=>({
     kind:s.kind==='interval'?'run':'recovery',
     distanceMeters:s.distanceMeters??null,durationSeconds:null,
     paceSecondsPerKm:s.pace?.seconds??null,
     notes:s.notes||''
    }))
   return {name,notes:w.blocks.join(' + ')+' 1000-m-Blöcke',steps}
  })
 }
}
export function workoutSummary(group:TrainerGroup){
 const efforts=group.steps.filter(s=>s.kind==='run')
 const totalMeters=efforts.reduce((n,s)=>n+(s.distanceMeters||0),0)
 return {intervals:efforts.length,distanceMeters:totalMeters,
  recoveries:group.steps.filter(s=>s.kind==='recovery').length}
}

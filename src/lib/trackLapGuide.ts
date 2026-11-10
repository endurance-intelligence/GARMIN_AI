/**
 * Track-running cue sheet. Never a live Garmin upload payload.
 * The start/finish lines and 200m mark, not GPS distance, determine step
 * completion. A runner presses LAP to advance at each real-world marker.
 */
import type {TrainerWorkout,TrainerGroup,TrainerStep,WorkoutEndMode} from './workoutLibrary.ts'
import {formatPace,endModeFor} from './workoutLibrary.ts'
export type TrackLapCue={
 index:number;type:'warmup'|'run'|'recovery'|'cooldown';
 block:number|null;withinBlock:number|null;blocks:number|null;
 repeat:number|null;repeats:number|null;distanceMeters:number|null;
 paceSecondsPerKm:number|null;paceLabel:string|null;
 fourHundredSeconds:number|null;expectedSeconds:number|null;
 target:string;end:WorkoutEndMode
}
const extractBlocks=(group:TrainerGroup):number[]=>{
 const n=group.steps.filter(s=>s.kind==='run').length
 const m=group.notes.match(/(?:^|\b)([1-9]\d?(?:\s*\+\s*[1-9]\d?){1,6})\b/)
 if(!m)return [n]
 const values=m[1].split('+').map(Number)
 return values.reduce((x,y)=>x+y,0)===n?values:[n]
}
const round=(value:number)=>Math.round(value)
export function splitClock(seconds:number|null):string{
 if(seconds===null||!Number.isFinite(seconds)||seconds<0)return '–'
 const min=Math.floor(seconds/60),secs=Math.round(seconds)%60
 return (min+Math.floor(secs/60))+':'+String(secs%60).padStart(2,'0')
}
export function makeTrackLapGuide(workout:TrainerWorkout,groupName:string):TrackLapCue[]{
 const group=workout.groups.find(g=>g.name===groupName)
 if(!group)return []
 const blocks=extractBlocks(group)
 const total=group.steps.filter(s=>s.kind==='run').length
 let repeat=0,block=0,inBlock=0,index=0
 const cues:TrackLapCue[]=[]
 const add=(type:TrackLapCue['type'],step:TrainerStep|undefined)=>{
  const pace=step?.paceSecondsPerKm??null,meters=step?.distanceMeters??null
  const paceLabel=pace!==null?formatPace(pace):null
  const expected=pace!==null&&meters!==null?round(pace*meters/1000):null
  const fourHundred=pace!==null?round(pace*.4):null
  const label=type==='warmup'?'Einlaufen bis bereit':
   type==='cooldown'?'Locker auslaufen bis fertig':
   type==='recovery'?'Trabpause bis zur Bahnmarkierung':
   'Intervall '+repeat+'/'+total+' · '+(paceLabel??'Tempo prüfen')+'/km'
  cues.push({index:++index,type,block:type==='run'?block+1:null,
   withinBlock:type==='run'?inBlock:null,
   blocks:type==='run'?blocks.length:null,repeat:type==='run'?repeat:null,
   repeats:type==='run'?total:null,distanceMeters:meters,paceSecondsPerKm:pace,
   paceLabel,fourHundredSeconds:fourHundred,expectedSeconds:expected,
   target:label,end:step?endModeFor(step):'lap'})
 }
 add('warmup',{kind:'warmup',distanceMeters:workout.warmup.distanceMeters,
  durationSeconds:workout.warmup.durationSeconds,paceSecondsPerKm:null,
  notes:workout.warmup.notes,endMode:workout.warmup.endMode})
 for(const step of group.steps){
  if(step.kind==='run'){
   repeat++;inBlock++
   if(blocks[block]!==undefined&&inBlock>blocks[block]){
    block++;inBlock=1
   }
   add('run',step)
  }else if(step.kind==='recovery')add('recovery',step)
  else if(step.kind==='cooldown'||step.kind==='warmup')add(step.kind,step)
 }
 add('cooldown',{kind:'cooldown',distanceMeters:workout.cooldown.distanceMeters,
  durationSeconds:workout.cooldown.durationSeconds,paceSecondsPerKm:null,
  notes:workout.cooldown.notes,endMode:workout.cooldown.endMode})
 return cues
}
export function lapStepSummary(cue:TrackLapCue):string{
 const finish=cue.end==='lap'?'LAP an der Markierung':
  (cue.distanceMeters===null?'Distanz fehlt':cue.distanceMeters+' m automatisch')
 if(cue.type==='warmup')return 'Einlaufen · '+finish
 if(cue.type==='cooldown')return 'Auslaufen · '+finish
 if(cue.type==='recovery')return 'Trabpause · '+finish
 return 'Satz '+(cue.block??'?')+'/'+(cue.blocks??'?')+
  ' · Intervall '+cue.repeat+'/'+cue.repeats+
  ' · '+(cue.distanceMeters??'–')+' m · '+(cue.paceLabel||'Pace offen')+'/km · '+finish
}

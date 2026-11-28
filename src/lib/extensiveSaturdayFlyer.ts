import type {TrainerWorkout,TrainerStep} from './workoutLibrary.ts'
import {withNumberedSplitNotes} from './workoutSplitNotes.ts'
/** Exact trainer poster supplied 2026-11-27; only loaded explicitly for owner review.
 * Jog range retained verbatim; single numeric pace uses its midpoint.
 * Purple break replaces the jog at the division, as drawn. LAP termination
 * remains manual; the 60-second duration is the target, not a timed auto-stop. */
export function extensiveSaturdayFlyer():TrainerWorkout{
 const groups=[
  {name:'Fuchs',count:8,first:4,pace:255,jog:285,range:'4:40–4:50'},
  {name:'Wolf',count:7,first:4,pace:275,jog:305,range:'5:00–5:10'},
  {name:'Tiger',count:6,first:3,pace:295,jog:325,range:'5:20–5:30'},
  {name:'Bären',count:6,first:3,pace:315,jog:345,range:'5:40–5:50'},
  {name:'Capybara',count:5,first:3,pace:335,jog:365,range:'6:00–6:10'}
 ]
 return {version:1,title:'Extensiv & zügig · 1000 m + 200 m',trainer:'Oerlinghausen Runcrew',sourceLabel:'Speed Saturday · Original-Trainer-Grafik',
 warmup:{distanceMeters:2000,durationSeconds:null,notes:'Einlaufen + Lauf-ABC',endMode:'lap'},
 cooldown:{distanceMeters:null,durationSeconds:null,notes:'Auslaufen + locker dehnen',endMode:'lap'},
 groups:groups.map(g=>{
  const steps:TrainerStep[]=[]
  for(let i=0;i<g.count;i++){
   steps.push({kind:'run',distanceMeters:1000,durationSeconds:null,paceSecondsPerKm:g.pace,notes:'I'+(i+1)+' · knapp unter Schwelle, kontrolliert',endMode:'lap'})
   if(i===g.count-1)continue
   steps.push(i+1===g.first?{kind:'recovery',distanceMeters:null,durationSeconds:60,paceSecondsPerKm:null,notes:'1 Minute Trinkpause · LAP nach 60 Sekunden',endMode:'lap'}:{kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:g.jog,notes:'Zügige Trabpause · '+g.range+' min/km',endMode:'lap'})
  }
  return {name:g.name,notes:g.first+' + '+(g.count-g.first)+' · 1000 m knapp unter Schwelle · 200 m zügig ('+g.range+'/km) · 1 Minute Trinkpause zwischen den Blöcken',steps:withNumberedSplitNotes(steps)}
 })}
}

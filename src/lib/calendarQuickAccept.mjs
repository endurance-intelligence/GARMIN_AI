import {trainingAlternativeForDate} from './goalTrainingFocus.mjs'
/** Explicit quick acceptance only for a still-open, eligible Coach proposal. */
export function quickCoachAction(plan,date,today){
 if(!plan||!Array.isArray(plan.days)||typeof date!=='string'||date<today)return null
 const offset=(Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000
 if(!Number.isInteger(offset)||offset>13||offset<0)return null
 const d=plan.days.find(x=>x.date===date)
 if(!d||d.decision||d.selectedGroup)return null
 if(d.kind==='recovery')return 'rest'
 if(!d.approvable||!['easy','long','return_easy','mobility'].includes(d.kind))return null
 return trainingAlternativeForDate(plan,date)?'choose':'draft'
}

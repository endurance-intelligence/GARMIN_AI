import type {TrainerStep} from './workoutLibrary.ts'
const clock=(s:number)=>{const t=Math.round(s);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}
const validPace=(p:number|null)=>p!==null&&Number.isSafeInteger(p)&&p>=120&&p<=900
export function isDrinkBreak(step:TrainerStep):boolean{
 return step.kind==='recovery'&&/(?:trinkpause|trink-pause|drink break|wasserpause)/i.test(step.notes)
}
/** Cumulative times at 200-m markers, plus the finish if it is not a 200-m multiple. */
export function split200Text(step:TrainerStep):string{
 const d=step.distanceMeters,p=step.paceSecondsPerKm
 if(d===null||p===null||!Number.isSafeInteger(d)||d<20||d>50000||!validPace(p)||!['run','recovery'].includes(step.kind))return ''
 if(step.kind==='recovery')return clock(d*p/1000)
 const cap=Math.min(d,4000)
 const points=Array.from({length:Math.floor(cap/200)},(_,i)=>(i+1)*200)
 if(cap%200)points.push(cap)
 return points.map(m=>clock(m*p/1000)).join(' | ')+(d>cap?' (erste 4000 m)':'')
}
function explicitTime(step:TrainerStep):string{
 return step.durationSeconds!==null&&Number.isSafeInteger(step.durationSeconds)&&step.durationSeconds>0?clock(step.durationSeconds):''
}
/** Counters restart for each group; a drink break is not a jog repetition. */
export function numberedStepComments(steps:TrainerStep[]):string[]{
 let lap=0,jog=0
 return steps.map(step=>{
  if(isDrinkBreak(step))return 'Trinkpause'+(explicitTime(step)?': '+explicitTime(step):'')
  if(step.kind==='run')return 'L'+(++lap)+': '+(split200Text(step)||explicitTime(step)||'Tempo offen')
  if(step.kind==='recovery')return 'T'+(++jog)+': '+(explicitTime(step)||split200Text(step)||'Zeit offen')
  return ''
 })
}
const chain=String.raw`(?:\d+:\d{2})(?: \| \d+:\d{2})*(?: \(erste 4000 m\))?`
const numberedPrefix=new RegExp('^(?:[LT]\\d+: (?:'+chain+'|Tempo offen|Zeit offen)|Trinkpause(?:: '+chain+')?)(?: · |$)')
function originalNote(step:TrainerStep):string{
 let note=step.notes.replace(/(?:\s*\|\s*|^)200-m-Splits: [0-9: –]+(?: \(erste 1000 m\))?$/,'').trim()
 // Remove previously generated numbered prefix, never free-form trainer comments.
 // Keep the plain drink label as the semantic signal for the next recalculation.
 if(isDrinkBreak(step)){
  note=note.replace(/^Trinkpause(?:: \d+:\d{2})?(?: · |$)/,'').trim()
 }else note=note.replace(numberedPrefix,'').trim()
 // Convert the former manual I7 || 55 – 1:50 … convention.
 // Other handwritten timings or instructions stay untouched.
 note=note.replace(/^I\d+\s*\|\|\s*\d+(?::\d{2})?(?:\s*[–—-]\s*\d+:\d{2})+(?:\s*·\s*|$)/,'').trim()
 note=note.replace(/^I\d+(?:\s*·\s*|$)/,'').trim()
 return note
}
export function withNumberedSplitNotes(steps:TrainerStep[]):TrainerStep[]{
 const comments=numberedStepComments(steps)
 return steps.map((step,i)=>{
  if(!comments[i])return step
  const original=originalNote(step)
  const next=[comments[i],original].filter(Boolean).join(' · ')
  // Never silently delete trainer instructions to fit the archive's 180-char limit.
  return next.length<=180?{...step,notes:next}:step
 })
}
// Compatibility for callers constructing a single step; group save renumbers it.
export function withSplitNote(step:TrainerStep):TrainerStep{return withNumberedSplitNotes([step])[0]}

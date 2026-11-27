import type {TrainerStep} from './workoutLibrary.ts'
export function split200Text(step:TrainerStep):string{
 const d=step.distanceMeters,p=step.paceSecondsPerKm
 if(!Number.isSafeInteger(d)||!Number.isSafeInteger(p)||d===null||p===null||d<200||d>50000||p<120||p>900||!['run','recovery'].includes(step.kind))return ''
 // Round cumulative times, never sum rounded 200m increments.
 const clock=(s:number)=>{const t=Math.round(s);return t<60?String(t):Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}
 const points=Array.from({length:Math.min(5,Math.floor(d/200))},(_,i)=>(i+1)*200)
 return '200-m-Splits: '+points.map(m=>clock(m*p/1000)).join(' – ')+(d>1000?' (erste 1000 m)':'')
}
export function withSplitNote(step:TrainerStep):TrainerStep{
 const split=split200Text(step)
 if(!split)return step
 // Keep handwritten notes, including an existing handwritten split chain.
 const note=step.notes.trim()
 if(/\d+(?::\d{2})?\s*[–—-]\s*\d+:\d{2}/.test(note)||note.includes('200-m-Splits:'))return step
 const next=[note,split].filter(Boolean).join(' | ')
 return next.length<=180?{...step,notes:next}:step
}

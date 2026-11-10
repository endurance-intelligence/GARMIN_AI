/** Shared sanitization used by the private Edge endpoint.
 * AI is an untrusted *transcriber*. It never gets to approve or save anything.
 */
const cleanText=(v,max,mandatory=false)=>{
 if(typeof v!=='string')return mandatory?null:''
 const trimmed=v.trim()
 return trimmed.length<=max&&(!mandatory||trimmed.length>0)?trimmed:null
}
const positive=(v,min,max)=>typeof v==='number'&&Number.isSafeInteger(v)&&
 v>=min&&v<=max
const optional=(v,min,max)=>v===null||
 positive(v,min,max)
const stepKinds=new Set(['run','recovery','drill','warmup','cooldown'])
export function validateTrainerWorkout(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||
    value.version!==1)return null
 const title=cleanText(value.title,120,true)
 const trainer=cleanText(value.trainer,100)
 const sourceLabel=cleanText(value.sourceLabel,120)
 if(title===null||trainer===null||sourceLabel===null||
    !Array.isArray(value.groups)||value.groups.length<1||
    value.groups.length>12)return null
 const meta=(value,kind)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const dist=value.distanceMeters??null,duration=value.durationSeconds??null
  const notes=cleanText(value.notes,250)
  if(notes===null||!optional(dist,20,50000)||!optional(duration,20,36000))
   return null
  return {kind,distanceMeters:dist,durationSeconds:duration,notes}
 }
 const warmup=meta(value.warmup,'warmup')
 const cooldown=meta(value.cooldown,'cooldown')
 if(!warmup||!cooldown)return null
 const groupNames=new Set()
 const groups=[]
 let totalSteps=0
 for(const group of value.groups){
  if(!group||typeof group!=='object'||Array.isArray(group))return null
  const name=cleanText(group.name,50,true)
  const notes=cleanText(group.notes,350)
  if(!name||notes===null||groupNames.has(name.toLowerCase())||
     !Array.isArray(group.steps)||group.steps.length<1||group.steps.length>160)return null
  groupNames.add(name.toLowerCase())
  const steps=[]
  let workouts=0
  for(const s of group.steps){
   if(!s||typeof s!=='object'||Array.isArray(s)||
      !stepKinds.has(s.kind))return null
   const dist=s.distanceMeters??null,duration=s.durationSeconds??null
   const pace=s.paceSecondsPerKm??null
   const comment=cleanText(s.notes,180)
   if(!optional(dist,20,50000)||!optional(duration,10,14400)||
      !optional(pace,120,900)||comment===null||
      (dist===null&&duration===null&&!['drill','warmup','cooldown','recovery'].includes(s.kind)))return null
   if(s.kind==='run'){workouts++}
   steps.push({kind:s.kind,distanceMeters:dist,durationSeconds:duration,
    paceSecondsPerKm:pace,notes:comment})
  }
  if(workouts<1)return null
  totalSteps+=steps.length
  if(totalSteps>500)return null
  groups.push({name,notes,steps})
 }
 return {version:1,title,trainer,sourceLabel,warmup,cooldown,groups}
}
export function describeWorkoutGroup(w,groupName){
 const group=w.groups.find(g=>g.name===groupName)
 if(!group)return null
 const efforts=group.steps.filter(s=>s.kind==='run')
 const distance=efforts.reduce((sum,s)=>sum+(s.distanceMeters||0),0)
 return {name:group.name,efforts:efforts.length,effortMeters:distance,
  recoveryCount:group.steps.filter(s=>s.kind==='recovery').length}
}

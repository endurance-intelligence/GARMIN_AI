/**
 * GARMIN_AI -> Intervals.icu safe run-workout serializer.
 * Native Intervals syntax: m means MINUTES, meters MUST be mtr.
 * Press lap steps carry a short planning-duration estimate, but Garmin finishes
 * by LAP (not by that estimate). No fabricated paces or activity load scores.
 */
const kinds=new Set(['run','recovery','drill','warmup','cooldown'])
const MAX_STEPS=50
const integer=(n,a,b)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=a&&n<=b
const clean=(s)=>String(s||'').replace(/[^\p{L}\p{N} .:_-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,50)
const paceText=(s)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0')
const timeToken=(seconds)=>{
 if(!integer(seconds,10,3*3600))throw Error('Invalid estimated step duration')
 const mins=Math.floor(seconds/60),secs=seconds%60
 return (mins?mins+'m':'')+(secs?secs+'s':'')||'10s'
}
const paceTarget=(p)=>{
 if(p===null||p===undefined)return ''
 if(!integer(p,120,900))throw Error('Invalid running pace')
 const fast=Math.max(120,p-10),slow=Math.min(900,p+10)
 return paceText(fast)+'-'+paceText(slow)+'/km Pace'
}
const defaultSeconds=(s)=>{
 if(s.durationSeconds!==null&&s.durationSeconds!==undefined){
  if(!integer(s.durationSeconds,10,10800))throw Error('Invalid prescribed duration')
  return s.durationSeconds
 }
 const dist=s.distanceMeters
 if(dist===null||dist===undefined)return s.kind==='warmup'?600:s.kind==='cooldown'?480:60
 // These are preview estimates ONLY; pressing LAP ends the step.
 // If the trainer supplied a pace, use it; otherwise a conservative
 // 6 min/km for easy/warmup and 7 min/km for easy recovery as previews.
 const reference=integer(s.paceSecondsPerKm,120,900)?s.paceSecondsPerKm:
  s.kind==='recovery'?420:360
 return Math.max(20,Math.min(3*3600,Math.round((dist/1000*reference)/5)*5))
}
function render(s){
 if(!s||!kinds.has(s.kind))throw Error('Unsupported workout step kind')
 const dist=s.distanceMeters??null,mode=s.endMode??'lap'
 if(dist!==null&&!integer(dist,20,50000))throw Error('Invalid step distance')
 if(!['lap','distance'].includes(mode))throw Error('Invalid step completion control')
 if(mode==='distance'&&dist===null)throw Error('Distance control requires a real distance')
 const intensity=s.kind==='run'?'interval':s.kind==='recovery'?'recovery':
  s.kind==='warmup'?'warmup':s.kind==='cooldown'?'cooldown':'other'
 // Deliberately avoid labels like 1000M or 200M: M is a MINUTE suffix
 // in the Intervals.icu parser and was causing the 207h/1971km bug.
 const title=s.kind==='run'?'LAUF':s.kind==='recovery'?'TRAB':
  s.kind==='warmup'?'EINLAUFEN':s.kind==='cooldown'?'AUSLAUFEN':'DRILLS'
 const label=dist===null?title:title+' '+dist+'er'
 const duration=mode==='distance'?dist+'mtr':timeToken(defaultSeconds(s))
 const target=paceTarget(s.paceSecondsPerKm)
 const line='- '+(mode==='lap'?'Press lap ':'')+[clean(label),duration,target,'intensity='+intensity].filter(Boolean).join(' ')
 return {line,mode,dist,paceSecondsPerKm:s.paceSecondsPerKm??null}
}
export function buildIntervalsWorkout(snapshot,title){
 if(!snapshot||typeof snapshot!=='object'||!snapshot.group||
  !Array.isArray(snapshot.group.steps)||!snapshot.group.steps.length)
  throw Error('Missing selected and reviewed trainer group')
 const source=[{kind:'warmup',...(snapshot.warmup||{})},...snapshot.group.steps,
               {kind:'cooldown',...(snapshot.cooldown||{})}]
 if(source.length>MAX_STEPS)throw Error('Garmin supports at most 50 workout steps')
 if(!source.some(s=>s.kind==='run'))throw Error('Workout contains no running steps')
 const mapped=source.map(render)
 const description=[
  'Einlaufen',
  mapped[0].line,'',
  clean(snapshot.group.name||'Intervalle'),
  ...mapped.slice(1,-1).map(x=>x.line),'',
  'Auslaufen',
  mapped[mapped.length-1].line
 ].join('\n')
 if(description.length>16000)throw Error('Workout description too long')
 const expectedDistance=source.reduce((total,s)=>total+(s.distanceMeters||0),0)
 return {name:clean(title)||'GARMIN_AI Training',type:'Run',category:'WORKOUT',target:'PACE',
  description,stepCount:mapped.length,steps:mapped,expectedDistance}
}
export function workoutLocalTime(date){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay()
 if(weekday===6)return '09:00' // ORC Track Saturday
 if([1,2,3].includes(weekday))return '19:00' // Football, Tue Track, Wed Group Run
 return '18:00' // Custom day: explicit start-time UI to follow
}
export function buildIntervalsEvent(plan){
 if(!plan||!plan.archive_snapshot||!/^[0-9a-f-]{36}$/i.test(String(plan.id))||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(plan.training_date)))
  throw Error('Invalid approved plan')
 const w=buildIntervalsWorkout(plan.archive_snapshot,plan.title)
 return {category:w.category,type:w.type,name:w.name,target:w.target,
   start_date_local:plan.training_date+'T'+workoutLocalTime(plan.training_date)+':00',
   external_id:'garmin-ai:'+plan.id,description:w.description}
}
function allSteps(steps){
 if(!Array.isArray(steps))return []
 return steps.flatMap(s=>Array.isArray(s?.steps)?allSteps(s.steps):[s])
}
export function validateStoredIntervalsWorkout(found,snapshot,event){
 if(!found||found.category!=='WORKOUT'||String(found.type||'').toLowerCase()!=='run')
  return {ok:false,reason:'Wrong calendar event type'}
 if(found.external_id!==event.external_id||found.start_date_local!==event.start_date_local)
  return {ok:false,reason:'External ID or local start time mismatched'}
 if(found.description!==event.description)
  return {ok:false,reason:'Workout text does not match the published version'}
 const expected=buildIntervalsWorkout(snapshot,event.name)
 const steps=allSteps(found.workout_doc?.steps)
 if(steps.length!==expected.stepCount)
  return {ok:false,reason:'Workout step count or structure not parsed'}
 const moving=Number(found.moving_time??found.workout_doc?.duration)
 const distance=Number(found.distance??found.workout_doc?.distance)
 if(!Number.isFinite(moving)||moving<=0||moving>4*3600||
    !Number.isFinite(distance)||distance<0||distance>60000)
  return {ok:false,reason:'Impossible duration or distance returned by Intervals.icu'}
 for(let i=0;i<expected.steps.length;i++){
  const step=steps[i],spec=expected.steps[i]
  if(!step||typeof step!=='object')return {ok:false,reason:'Invalid parsed step'}
  const lap=step.until_lap_press===true||step.press_lap===true
  if((spec.mode==='lap')!==lap)return {ok:false,reason:'LAP completion mode lost at step '+(i+1)}
  if(spec.mode==='distance'){
   const actual=Number(step.distance)
   if(!Number.isFinite(actual)||Math.abs(actual-spec.dist)>2)
    return {ok:false,reason:'Distance completion lost at step '+(i+1)}
  }
  if(spec.paceSecondsPerKm!==null){
   const pace=step.pace
   if(!pace||!Number.isFinite(Number(pace.start))||!Number.isFinite(Number(pace.end))||
      String(pace.units||'')!=='secs/km'||Math.abs(Number(pace.start)-(spec.paceSecondsPerKm-10))>2||
      Math.abs(Number(pace.end)-(spec.paceSecondsPerKm+10))>2)
    return {ok:false,reason:'Pace target lost at step '+(i+1)}
  }
 }
 return {ok:true,reason:'parsed'}
}

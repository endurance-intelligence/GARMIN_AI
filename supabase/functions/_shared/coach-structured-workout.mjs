/** Deterministic, low-intensity coach proposal -> real time-controlled Run workout.
 * Deliberately no invented pace, heart-rate limit, distance or training score.
 * The server constructs this, not the browser. Always draft -> approve -> publish.
 */
const plans={
 easy:{min:20,max:60,label:'Locker'},
 long:{min:35,max:150,label:'Langer ruhiger Lauf'},
 return_easy:{min:10,max:30,label:'Wiedereinstieg locker'}
}
export function coachWorkoutAllowed(context,kind,day){
 // The owner-only Coach Context API represents a newly configured athlete
 // without a database row as "well" with no blocked dates. PostgreSQL
 // maybeSingle() returns null for exactly that case. Preserve the same
 // canonical initial state for draft creation, approval AND publication.
 // Query errors are rejected by each caller BEFORE reaching this function.
 // Undefined, malformed or incomplete contexts must still fail closed.
 const state=context===null?{
  illness_state:'well',return_started_on:null,blocked_periods:[]
 }:context
 if(!state||typeof state!=='object'||Array.isArray(state)||
  !['well','sick','returning'].includes(state.illness_state)||
  !Array.isArray(state.blocked_periods)||!plans[kind]||
  typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))
  return false
 const blocks=state.blocked_periods
 if(blocks.some(b=>typeof b?.start==='string'&&typeof b?.end==='string'&&
  day>=b.start&&day<=b.end))return false
 if(state.illness_state==='sick')return false
 if(state.illness_state==='returning')return kind==='return_easy'
 if(state.illness_state!=='well')return false
 if(kind==='return_easy')return false
 // The first 14 days following a declared return remain conservative.
 if(kind==='long'&&typeof state.return_started_on==='string'){
  const age=(Date.parse(day+'T12:00:00Z')-
   Date.parse(state.return_started_on+'T12:00:00Z'))/86400000
  if(Number.isFinite(age)&&age>=0&&age<14)return false
 }
 return true
}
export function buildCoachStructuredSnapshot(input){
 const kind=input?.kind,rule=plans[kind]
 if(!rule||!Number.isSafeInteger(input.minutes)||
  input.minutes<rule.min||input.minutes>rule.max||
  typeof input.title!=='string'||input.title.trim().length<1||
  input.title.length>120||
  typeof input.startTime!=='string'||!/^(0[5-9]|1[0-9]|2[0-2]):(00|15|30|45)$/.test(input.startTime))
  return null
 const total=input.minutes
 const warmup=Math.min(5,Math.floor(total/3))
 const cooldown=Math.min(5,Math.floor(total/3))
 const work=total-warmup-cooldown
 if(work<4)return null
 const step=(kind,seconds)=>({kind,distanceMeters:null,
   durationSeconds:seconds,paceSecondsPerKm:null,notes:'',
   endMode:'time',intensity:kind==='run'?'active':null})
 return {
  schemaVersion:1,sourceKind:'coach',coachKind:kind,
  title:input.title.trim(),coachName:'GARMIN_AI Coach',
  sourceLabel:'Coach Intelligence · persönlich freigegebener Entwurf',
  startTime:input.startTime,
  group:{name:'Ruhiger Dauerlauf',
   notes:'Sprechtempo / subjektiv locker. Kein vorgegebener Pace- oder HF-Grenzwert.',
   steps:[step('run',work*60)]},
  warmup:step('warmup',warmup*60),
  cooldown:step('cooldown',cooldown*60)
 }
}
export function coachWorkoutDuration(snapshot){
 if(snapshot?.sourceKind!=='coach')return null
 const items=[snapshot.warmup,...(snapshot.group?.steps||[]),snapshot.cooldown]
 if(items.length!==3||items.some(x=>!Number.isSafeInteger(x?.durationSeconds)||
  x.durationSeconds<60||x.endMode!=='time'||x.paceSecondsPerKm!==null))
  return null
 return items.reduce((v,x)=>v+x.durationSeconds,0)
}

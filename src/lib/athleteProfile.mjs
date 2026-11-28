/** Explicit preferences, not inferred identity, fitness or sex. */
export const ATHLETE_SPORTS=[['running','Laufen'],['walking','Walking / Wandern'],['football','Fußball'],['strength','Stabi & Mobility'],['rowing','Rudern'],['treadmill','Laufband'],['trainer','Rollentrainer'],['cycling','Fahrrad']]
export const ATHLETE_LEVELS=[['beginner','Einsteigerin / Einsteiger'],['returning','Wiedereinstieg'],['regular','Regelmäßig trainierend']]
export const ATHLETE_GOALS=[['fitness','Allgemeine Fitness'],['endurance','Ausdauer aufbauen'],['race','Wettkampf vorbereiten']]
export const emptyAthleteProfile=()=>({sports:[],daysPerWeek:null,sessionMinutes:null,preferredDays:[],level:null,goal:null,cycleEnabled:false})
const oneOf=(x,options)=>options.some(([id])=>id===x)
export function normalizeAthleteProfile(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(p.sports)||!p.sports.length||p.sports.some(x=>!oneOf(x,ATHLETE_SPORTS))||new Set(p.sports).size!==p.sports.length||
 !Number.isInteger(p.daysPerWeek)||p.daysPerWeek<1||p.daysPerWeek>7||!Number.isInteger(p.sessionMinutes)||p.sessionMinutes<15||p.sessionMinutes>180||
 !Array.isArray(p.preferredDays)||p.preferredDays.some(d=>!Number.isInteger(d)||d<1||d>7)||new Set(p.preferredDays).size!==p.preferredDays.length||p.preferredDays.length>p.daysPerWeek||
 !oneOf(p.level,ATHLETE_LEVELS)||!oneOf(p.goal,ATHLETE_GOALS)||typeof p.cycleEnabled!=='boolean')return null
 return {sports:ATHLETE_SPORTS.filter(([id])=>p.sports.includes(id)).map(([id])=>id),daysPerWeek:p.daysPerWeek,sessionMinutes:p.sessionMinutes,preferredDays:[...p.preferredDays].sort((a,b)=>a-b),level:p.level,goal:p.goal,cycleEnabled:p.cycleEnabled}
}
/** Do not decode numeric phase codes without verified Garmin payload semantics.
 * No pregnancy, notes, symptoms, or sexual data are retained or returned. */
export function cycleAvailability(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return 'unavailable'
 if(Number.isInteger(value.dayInCycle)&&value.dayInCycle>=1&&value.dayInCycle<=400&&Number.isInteger(value.currentPhase)&&value.currentPhase>=0)return 'schema-review'
 return 'unavailable'
}

// Capability flags only. Never return values, infer units, or store raw profiles.
// Explicit key presence is a schema candidate, not verified semantics.
export function profileFieldAvailability(raw){
 const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{}
 const root=obj(raw)
 const scopes=[root,obj(root.userData),obj(root.profile),obj(root.settings),obj(root.userProfile)]
 const has=(keys)=>scopes.some(x=>keys.some(k=>Object.hasOwn(x,k)&&x[k]!==null&&x[k]!==undefined&&x[k]!==''))
 return {heightCandidate:has(['height','heightCm','heightInCentimeters']),
  ageCandidate:has(['age','birthDate','dateOfBirth','birthYear']),
  sexCandidate:has(['gender','sex']),weightCandidate:has(['weight','weightKg','weightInGrams'])}
}

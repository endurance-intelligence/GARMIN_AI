/** A balanced, reproducible 30-minute circuit – varied, never a random grab-bag.
 * No fictitious workout readiness score. Day and rotation index only pick
 * alternatives within predefined movement patterns. Each date has a stable\n * variation; the Remix button shifts the selection without changing coverage.
 */
export type MovementPart='warmup'|'strength'|'cooldown'
export type MovementStep={exerciseId:string;part:MovementPart;round:number;workSeconds:number;restSeconds:number;pattern:string}
export type MovementPlan={steps:MovementStep[];exerciseIds:string[];minutes:number;strengthIds:string[];mobilityIds:string[]}
export const MOVEMENT_MINUTES=30
export const CIRCUIT_ROUNDS=3
export const MOVEMENT_PREP_SECONDS=5
export type MovementPlayer={index:number;rest:boolean;prestart:boolean;remaining:number;running:boolean;done:boolean}
export type MovementCue='countdown-start'|'countdown-end'|'go'
/** No extra time added: each one-minute mobility slot is 55s move + 5s change. */
export function startMovementPlayer():MovementPlayer{
 return {index:0,rest:false,prestart:true,remaining:MOVEMENT_PREP_SECONDS,running:true,done:false}
}
export function advanceMovementPlayer(p:MovementPlayer,plan:MovementPlan):MovementPlayer{
 const step=plan.steps[p.index]
 if(!step)return {...p,running:false,done:true,remaining:0}
 if(p.prestart)return {...p,prestart:false,remaining:step.workSeconds}
 if(!p.rest&&step.restSeconds>0)return {...p,rest:true,remaining:step.restSeconds}
 const index=p.index+1
 if(index>=plan.steps.length)return {...p,running:false,done:true,remaining:0}
 return {...p,index,rest:false,prestart:false,remaining:plan.steps[index].workSeconds}
}
export function tickMovementPlayer(p:MovementPlayer,plan:MovementPlan):MovementPlayer{
 if(!p.running||p.done)return p
 return p.remaining>1?{...p,remaining:p.remaining-1}:advanceMovementPlayer(p,plan)
}
/** A 40s strength step changes sides at 20s left; 55s mobility at 28s left.
 * The exercise metadata selects which steps actually need a mid-set switch. */
export function movementSideSwitchMoment(p:MovementPlayer,plan:MovementPlan):boolean{
 const step=plan.steps[p.index]
 return !!step&&p.running&&!p.done&&!p.rest&&!p.prestart&&
  p.remaining===Math.ceil(step.workSeconds/2)
}
export function movementPlayerCue(p:MovementPlayer,plan:MovementPlan):MovementCue|null{
 if(!p.running||p.done)return null
 if(p.remaining<=3&&p.remaining>=1){
  return p.prestart||p.rest?'countdown-start':'countdown-end'
 }
 return !p.prestart&&!p.rest&&p.remaining===plan.steps[p.index]?.workSeconds?'go':null
}
export const MOVEMENT_PATTERNS=[
 {id:'squat',alternatives:['bodyweight-squat']},
 {id:'hinge',alternatives:['glute-bridge','single-leg-glute-bridge']},
 {id:'single-leg',alternatives:['reverse-lunge']},
 {id:'push',alternatives:['push-up']},
 {id:'pull',alternatives:['reverse-snow-angel','prone-ytw']},
 {id:'core',alternatives:['dead-bug','forearm-plank','side-plank','bird-dog']},
 {id:'calf',alternatives:['calf-raise','single-leg-calf-raise','tibialis-raise']},
 {id:'shoulder',alternatives:['pike-push-up']}
] as const
const warmPool=['cat-cow','thoracic-rotation','knee-to-wall','adductor-rockback','short-foot','single-leg-balance','hip-flexor-stretch']
const coolPool=['child-pose-breathing','hip-flexor-stretch','thoracic-rotation','adductor-rockback']
function dateSeed(day:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Ungültiges Trainingsdatum')
 return Math.floor(Date.parse(day+'T12:00:00Z')/86400000)
}
function choose(pool:readonly string[],step:number,index:number){
 return pool[(step+index)%pool.length]
}
export function buildMovementPlan(day:string,rotation=0):MovementPlan{
 if(!Number.isInteger(rotation)||rotation<0||rotation>9999)throw Error('Ungültige Trainingsvariation')
 const seed=dateSeed(day)+rotation
 // Every exercise requires only body weight and a clear patch of floor.\n // The prone upper-back drills are NOT equivalent to a resisted pulling movement.\n // Spread patterns across the eight strength slots. Any week-to-week
 // variation must preserve the squat/hinge/push/pull/etc. coverage.
 const strengthIds=MOVEMENT_PATTERNS.map((pattern,i)=>
  choose(pattern.alternatives,seed,i))
 const warm=Array.from({length:4},(_,i)=>choose(warmPool,seed,i))
 const cooldown=Array.from({length:2},(_,i)=>choose(coolPool,seed+1,i))
 // Exactly 4*(55+5) + 8*3*(40+20) + (55+5)+60 = 1,800 seconds.
 // Strength rests retain their 20 seconds; their final 5 are the changeover.
 // The initial 5-second countdown occurs before the 30-minute plan.
 const steps:MovementStep[]=[
  ...warm.map(exerciseId=>({exerciseId,part:'warmup' as const,round:0,workSeconds:55,restSeconds:5,pattern:'mobility'})),
  ...Array.from({length:CIRCUIT_ROUNDS},(_,round)=>strengthIds.map((exerciseId,i)=>({
   exerciseId,part:'strength' as const,round:round+1,workSeconds:40,restSeconds:20,pattern:MOVEMENT_PATTERNS[i].id
  }))).flat(),
  ...cooldown.map((exerciseId,i)=>({exerciseId,part:'cooldown' as const,round:0,workSeconds:i===0?55:60,restSeconds:i===0?5:0,pattern:'mobility'}))
 ]
 const seconds=steps.reduce((sum,step)=>sum+step.workSeconds+step.restSeconds,0)
 if(seconds!==MOVEMENT_MINUTES*60)throw Error('Ungültige Trainingsdauer')
 const exerciseIds=[...new Set([...warm,...strengthIds,...cooldown])]
 return {steps,exerciseIds,minutes:MOVEMENT_MINUTES,strengthIds,mobilityIds:[...warm,...cooldown]}
}

import {EI_EXERCISES} from './eiExercises'

/** A balanced, reproducible 30-minute circuit – varied, never a random grab-bag.
 * No fictitious workout readiness score. Day and rotation index only pick
 * alternatives within predefined movement patterns. Each date has a stable\n * variation; the Remix button shifts the selection without changing coverage.
 */
export type MovementPart='warmup'|'strength'|'cooldown'
export type MovementStep={exerciseId:string;part:MovementPart;round:number;workSeconds:number;restSeconds:number;pattern:string;sideSwitch:boolean}
export type MovementPlan={steps:MovementStep[];exerciseIds:string[];minutes:number;strengthIds:string[];mobilityIds:string[]}
export const MOVEMENT_MINUTES=30
export const CIRCUIT_ROUNDS=3
export const MOVEMENT_PREP_SECONDS=5
export type MovementPlayerPhase='prepare'|'work'|'rest'|'switch'|'side-change'|'paused'|'done'
export type MovementPlayer={index:number;rest:boolean;prestart:boolean;sideChange:boolean;secondSide:boolean;remaining:number;running:boolean;done:boolean}
export type MovementCue='countdown-start'|'countdown-end'|'go'
/**
 * Each session slot is 60 seconds including movement, side change and rest.
 * Strength unilateral: 20 + 5 side change + 20 + 15 rest.
 * Mobility unilateral: 25 + 5 side change + 25 + 5 rest.
 * Final unilateral cooldown: 27 + 5 side change + 28, no rest.
 */
export function movementFirstSideSeconds(step:MovementStep):number{
 if(!step.sideSwitch)return step.workSeconds
 if(step.part==='strength')return Math.floor(step.workSeconds/2)
 return Math.floor((step.workSeconds-MOVEMENT_PREP_SECONDS)/2)
}
export function movementSecondSideSeconds(step:MovementStep):number{
 if(!step.sideSwitch)return 0
 if(step.part==='strength')return step.workSeconds-movementFirstSideSeconds(step)
 return step.workSeconds-MOVEMENT_PREP_SECONDS-movementFirstSideSeconds(step)
}
export function movementRestSeconds(step:MovementStep):number{
 return step.part==='strength'&&step.sideSwitch
  ?step.restSeconds-MOVEMENT_PREP_SECONDS:step.restSeconds
}
export function movementPlayerPhase(p:MovementPlayer):MovementPlayerPhase{
 if(p.done)return 'done'
 if(!p.running)return 'paused'
 if(p.prestart)return 'prepare'
 if(p.sideChange)return 'side-change'
 if(p.rest)return p.remaining<=MOVEMENT_PREP_SECONDS?'switch':'rest'
 return 'work'
}
export function startMovementPlayer():MovementPlayer{
 return {index:0,rest:false,prestart:true,sideChange:false,secondSide:false,
  remaining:MOVEMENT_PREP_SECONDS,running:true,done:false}
}
export function advanceMovementPlayer(p:MovementPlayer,plan:MovementPlan):MovementPlayer{
 const step=plan.steps[p.index]
 if(!step)return {...p,running:false,done:true,remaining:0}
 if(p.prestart)return {...p,prestart:false,sideChange:false,secondSide:false,
  remaining:movementFirstSideSeconds(step)}
 if(p.sideChange)return {...p,sideChange:false,secondSide:true,
  remaining:movementSecondSideSeconds(step)}
 if(!p.rest&&!p.secondSide&&step.sideSwitch)return {...p,sideChange:true,
  remaining:MOVEMENT_PREP_SECONDS}
 const rest=movementRestSeconds(step)
 if(!p.rest&&rest>0)return {...p,rest:true,remaining:rest}
 const index=p.index+1
 if(index>=plan.steps.length)return {...p,running:false,done:true,remaining:0}
 return {...p,index,rest:false,prestart:false,sideChange:false,secondSide:false,
  remaining:movementFirstSideSeconds(plan.steps[index])}
}
export function tickMovementPlayer(p:MovementPlayer,plan:MovementPlan):MovementPlayer{
 if(!p.running||p.done)return p
 return p.remaining>1?{...p,remaining:p.remaining-1}:advanceMovementPlayer(p,plan)
}
/** Fires once, at the start of the actual five-second side-change phase. */
export function movementSideSwitchMoment(p:MovementPlayer,plan:MovementPlan):boolean{
 return !!plan.steps[p.index]?.sideSwitch&&p.running&&!p.done&&p.sideChange&&
  p.remaining===MOVEMENT_PREP_SECONDS
}
export function movementPlayerCue(p:MovementPlayer,plan:MovementPlan):MovementCue|null{
 if(!p.running||p.done)return null
 if(p.remaining<=3&&p.remaining>=1)
  return p.prestart||p.rest||p.sideChange?'countdown-start':'countdown-end'
 const step=plan.steps[p.index]
 if(!step||p.prestart||p.rest||p.sideChange)return null
 return p.remaining===(p.secondSide?movementSecondSideSeconds(step):movementFirstSideSeconds(step))
  ?'go':null
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
const unilateralIds=new Set(EI_EXERCISES.filter(exercise=>exercise.sideSwitch).map(exercise=>exercise.id))
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
  ...warm.map(exerciseId=>({exerciseId,part:'warmup' as const,round:0,workSeconds:55,restSeconds:5,pattern:'mobility',sideSwitch:unilateralIds.has(exerciseId)})),
  ...Array.from({length:CIRCUIT_ROUNDS},(_,round)=>strengthIds.map((exerciseId,i)=>({
   exerciseId,part:'strength' as const,round:round+1,workSeconds:40,restSeconds:20,pattern:MOVEMENT_PATTERNS[i].id,sideSwitch:unilateralIds.has(exerciseId)
  }))).flat(),
  ...cooldown.map((exerciseId,i)=>({exerciseId,part:'cooldown' as const,round:0,workSeconds:i===0?55:60,restSeconds:i===0?5:0,pattern:'mobility',sideSwitch:unilateralIds.has(exerciseId)}))
 ]
 const seconds=steps.reduce((sum,step)=>sum+step.workSeconds+step.restSeconds,0)
 for(const step of steps){
  const actual=movementFirstSideSeconds(step)+
   (step.sideSwitch?MOVEMENT_PREP_SECONDS+movementSecondSideSeconds(step):0)+
   movementRestSeconds(step)
  if(actual!==step.workSeconds+step.restSeconds)throw Error('Ungültige Seitenwechselzeit')
 }
 if(seconds!==MOVEMENT_MINUTES*60)throw Error('Ungültige Trainingsdauer')
 const exerciseIds=[...new Set([...warm,...strengthIds,...cooldown])]
 return {steps,exerciseIds,minutes:MOVEMENT_MINUTES,strengthIds,mobilityIds:[...warm,...cooldown]}
}

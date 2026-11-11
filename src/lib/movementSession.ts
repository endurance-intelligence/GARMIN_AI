/** A balanced, reproducible 30-minute circuit – varied, never a random grab-bag.
 * No fictitious workout readiness score. Day and rotation index only pick
 * alternatives within predefined movement patterns.
 */
export type MovementPart='warmup'|'strength'|'cooldown'
export type MovementStep={exerciseId:string;part:MovementPart;round:number;workSeconds:number;restSeconds:number;pattern:string}
export type MovementPlan={steps:MovementStep[];exerciseIds:string[];minutes:number;strengthIds:string[];mobilityIds:string[]}
export const MOVEMENT_MINUTES=30
export const CIRCUIT_ROUNDS=3
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
 return Math.floor(Date.parse(day+'T12:00:00Z')/86400000/7)
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
 // Exactly 4*60 + 8*3*(40+20) + 2*60 = 1,800 seconds.
 const steps:MovementStep[]=[
  ...warm.map(exerciseId=>({exerciseId,part:'warmup' as const,round:0,workSeconds:60,restSeconds:0,pattern:'mobility'})),
  ...Array.from({length:CIRCUIT_ROUNDS},(_,round)=>strengthIds.map((exerciseId,i)=>({
   exerciseId,part:'strength' as const,round:round+1,workSeconds:40,restSeconds:20,pattern:MOVEMENT_PATTERNS[i].id
  }))).flat(),
  ...cooldown.map(exerciseId=>({exerciseId,part:'cooldown' as const,round:0,workSeconds:60,restSeconds:0,pattern:'mobility'}))
 ]
 const seconds=steps.reduce((sum,step)=>sum+step.workSeconds+step.restSeconds,0)
 if(seconds!==MOVEMENT_MINUTES*60)throw Error('Ungültige Trainingsdauer')
 const exerciseIds=[...new Set([...warm,...strengthIds,...cooldown])]
 return {steps,exerciseIds,minutes:MOVEMENT_MINUTES,strengthIds,mobilityIds:[...warm,...cooldown]}
}

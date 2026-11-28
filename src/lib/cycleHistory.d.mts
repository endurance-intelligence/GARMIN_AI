export type CycleObservation={date:string;dayInCycle:number}
export type CycleState={enabled:boolean;status:'idle'|'pending'|'stored'|'unavailable';lastAttempt:string|null;observations:CycleObservation[]}
export function cycleToday():string
export function normalizeCycleObservation(raw:unknown,date:string):CycleObservation|null
export function trimCycleHistory(rows:unknown,today:string):CycleObservation[]
export function publicCycleState(row:unknown,today:string):CycleState

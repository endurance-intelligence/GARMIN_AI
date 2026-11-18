export type RaceCheckpoint={
 index:number;distanceKm:number;legDistanceKm:number;moveMinutes:number;
 arrivalMinutes:number;arrivalText:string;pauseMinutes:number;longBreakMinutes:number;
 departureMinutes:number;departureText:string;finish:boolean
}
export type RaceExecution={
 status:'ready'|'missing';checkpoints:RaceCheckpoint[];
 estimate:import('./raceStrategyMath.mjs').RaceEstimate|null;
 target:{minutes:number;remaining:number;status:'within'|'over';text:string}|null;
 nutrition:{carbsG:number|null;fluidMl:number|null;sodiumMg:number|null;hours:number}|null;
 warning:string|null
}
export function buildRaceExecution(input:{
 distanceKm:number;courseMode:string;loopKm:number|null;
 movingMinutes:number|null;regularPauseMinutes:number|null;
 longStopEvery:number|null;longStopMinutes:number|null;paceSeconds:number|null;
 targetHours:number|null;carbsGPerHour:number|null;fluidMlPerHour:number|null;
 sodiumMgPerHour:number|null
}):RaceExecution

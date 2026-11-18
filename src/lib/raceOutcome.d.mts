export type RaceOutcome={
 matchStatus:'unique'|'ambiguous'|'unavailable';actualKm:number|null;
 actualMinutes:number|null;planDeltaMinutes:number|null;
 raceCheck:{reportedOn:string;fatigue:number;soreness:number;warning:boolean}|null;
 source:string;caveat:string
}
export function assessRaceOutcome(input:{
 raceDate:string;raceDistanceKm:number;plannedMinutes:number|null;
 board:any;checks?:any[]
}):RaceOutcome

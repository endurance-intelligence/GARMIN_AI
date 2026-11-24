export type RaceDayActivity={activityId:string;activityName:string;date:string;
 clock:string;distanceKm:number;durationMinutes:number}
export type RaceActivityLink={raceDate:string;raceName:string;activityId:string;confirmedOn:string}
export type RaceOutcome={
 matchStatus:'unique'|'confirmed'|'ambiguous'|'unavailable';
 matchSource:'athlete'|'distance'|'none';partial:boolean;actualKm:number|null;
 actualMinutes:number|null;planDeltaMinutes:number|null;
 activityId:string|null;garminRpe:number|null;garminFeeling:number|null;
 raceCheck:{reportedOn:string;fatigue:number;soreness:number;warning:boolean}|null;
 source:string;caveat:string
}
export declare function listRaceDayActivities(input:{raceDate:string;board:any}):RaceDayActivity[]
export declare function assessRaceOutcome(input:{
 raceDate:string;raceName?:string;raceDistanceKm:number;plannedMinutes:number|null;
 board:any;checks?:any[];links?:RaceActivityLink[]
}):RaceOutcome

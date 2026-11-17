export type RaceBudget={
 hours:number|null;totalMinutes:number|null;estimatedMovingPaceSeconds:number|null;
 targetMinutes:number|null;marginMinutes:number|null;
 plannedCarbsGrams:number|null;plannedFluidMl:number|null;
 plannedSodiumMg:number|null;completeFuel:boolean;note:string
}
export function estimateRaceBudget(input:{
 distanceKm:number|null;targetHours:number|null;calculation:any;
 carbsPerHour:number|null;fluidPerHour:number|null;sodiumPerHour:number|null
}):RaceBudget
export type RaceLapCheckpoint={lap:number;km:number;arrivalMinutes:number;
 stopMinutes:number;departureMinutes:number;last:boolean}
export function buildRaceLapCheckpoints(input:{
 distanceKm:number;loopKm:number|null;movingMinutes:number|null;
 regularPauseMinutes:number|null;longStopEvery:number|null;
 longStopMinutes:number|null
}):RaceLapCheckpoint[]
export type RaceReview={
 status:'unknown'|'upcoming'|'no-garmin-week'|'no-distance'|'ambiguous'|'not-matched'|'matched';
 message:string;race:any;garmin:null|{
  activityId:string;date:string;recordedKm:number;
  activityMinutes:number|null;avgPaceSeconds:number|null
 };recovery:any;plan:any;following:string;timingNote?:string;fuelingNote?:string
}
export function buildRaceReview(input:{
 today:string;race?:{raceDate:string;raceName:string;distanceKm:number|null}|null;
 strategy?:any;board?:any;context?:any
}):RaceReview

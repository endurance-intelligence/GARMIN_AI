export type RaceMark={arrivalMinutes?:number;departureMinutes?:number}
export type RaceMarks=Record<string,RaceMark>
export type RaceRecording={ok:boolean;reason:string|null;marks:RaceMarks}
export declare const formatRaceElapsed:(minutes:number|null)=>string
export declare function parseRaceElapsed(raw:string):number|null
export declare function raceElapsedNow(input:{raceDate:string;startTime:string|null;now?:Date}):number|null
export declare function recordRaceMark(marks:RaceMarks,checkpoints:import('./raceExecution.mjs').RaceCheckpoint[],index:number,kind:'arrival'|'departure',elapsed:number):RaceRecording
export declare function sanitizeRaceMarks(marks:RaceMarks,checkpoints:import('./raceExecution.mjs').RaceCheckpoint[]):RaceMarks
export declare function undoLastRaceMark(marks:RaceMarks,checkpoints:import('./raceExecution.mjs').RaceCheckpoint[]):RaceRecording
export type RaceDayRow=import('./raceExecution.mjs').RaceCheckpoint&{
 arrival:number|null;departure:number|null;plannedClock:string|null;actualClock:string|null;
 arrivalDelta:number|null;departureDelta:number|null
}
export type RaceDayModel={
 status:'ready'|'missing';rows:RaceDayRow[];marks:RaceMarks;
 latest:RaceDayRow|null;lastAction:{kind:string;point:RaceDayRow;actualMinutes:number;plannedMinutes:number}|null;
 next:RaceDayRow|null;buffer:number|null;finished:boolean;recorded:number;
 targetMinutes:number|null;plan:import('./raceExecution.mjs').RaceExecution
}
export declare function buildRaceDayCockpit(input:{
 input:{distanceKm:number;courseMode:string;loopKm:number|null;movingMinutes:number|null;
 regularPauseMinutes:number|null;longStopEvery:number|null;longStopMinutes:number|null;
 paceSeconds:number|null;targetHours:number|null;carbsGPerHour:number|null;
 fluidMlPerHour:number|null;sodiumMgPerHour:number|null};
 marks?:RaceMarks;startTime?:string|null
}):RaceDayModel
export declare function raceDayLogText(input:{goal:{race_name:string;race_date:string};
 model:RaceDayModel;startTime:string|null}):string

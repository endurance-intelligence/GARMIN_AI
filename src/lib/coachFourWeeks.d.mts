export type CoachHistoryWeek={
 start:string;end:string;available:boolean;runs:number|null;
 distanceKm:number|null;rated:number|null;hard:number|null;weak:number|null;
 longestRunMinutes:number|null;
 approved:number|null;matched:number|null;overlong:number|null;
 accepted:number|null;declined:number|null;planCoverage:boolean
}
export type CoachWorkoutTolerance={
 kind:string;label:string;matched:number;rated:number;hard:number;weeks:number;hardWeeks:number;
 assessment:'limited'|'review-low-intensity'|'repeated-strain'|'observed'
}
export type CoachFourWeeks={
 status:'unavailable'|'empty'|'partial'|'ready';weeks:CoachHistoryWeek[];
 completeWeeks:number;totalRuns:number|null;totalRated:number|null;
 totalMatched:number|null;qualityCaution:boolean;repeatedToughWeeks:number;
 workoutTolerance:CoachWorkoutTolerance[];lowIntensityCautionKinds:string[];
 title:string;explanation:string;suggestion:string
}
export declare function analyzeCoachFourWeeks(input:{
 today:string;boards:any[];plans:{entries:any[];historyFrom?:string};life?:any
}):CoachFourWeeks

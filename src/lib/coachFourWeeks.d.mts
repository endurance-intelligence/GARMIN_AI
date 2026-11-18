export type CoachHistoryWeek={
 start:string;end:string;available:boolean;runs:number|null;
 distanceKm:number|null;rated:number|null;hard:number|null;weak:number|null;
 approved:number|null;matched:number|null;overlong:number|null;
 accepted:number|null;declined:number|null;planCoverage:boolean
}
export type CoachFourWeeks={
 status:'unavailable'|'empty'|'partial'|'ready';weeks:CoachHistoryWeek[];
 completeWeeks:number;totalRuns:number|null;totalRated:number|null;
 totalMatched:number|null;qualityCaution:boolean;repeatedToughWeeks:number;
 title:string;explanation:string;suggestion:string
}
export declare function analyzeCoachFourWeeks(input:{
 today:string;boards:any[];plans:{entries:any[];historyFrom?:string};life?:any
}):CoachFourWeeks

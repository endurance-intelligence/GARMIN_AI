export type LongTermWeek={
 start:string;end:string;available:boolean;runs:number|null;distanceKm:number|null;
 rated:number|null;hard:number|null;weak:number|null;longestRunMinutes:number|null;
 approved:number|null;matched:number|null;accepted:number|null;declined:number|null;
 rpe:{low:number;moderate:number;high:number;count:number;missing:number}|null
}
export type CoachLongTerm={
 status:'unavailable'|'partial'|'limited'|'ready';weeksRequested:8|12;
 completeWeeks:number;measuredWeeks:number;weeks:LongTermWeek[];
 blocks:Array<{label:string;measured:number;complete:number;medianKm:number|null;totalKm:number|null}>;
 currentMedianKm:number|null;previousMedianKm:number|null;oldestMedianKm:number|null;
 changePct:number|null;trend:'unknown'|'stable'|'up'|'down';reviewedRpe:number;
 rpe:{low:number;moderate:number;high:number;count:number;missing:number};
 longRunsMeasured:number;hardWeeks:number;flags:string[];
 raceProtected:boolean;title:string;advice:string;source:string;readOnly:true
}
export declare function longTermWeekStarts(today:string,count?:8|12):string[]
export declare function analyzeCoachLongTerm(input:{
 today:string;boards:any[];plans?:{entries:any[];historyFrom?:string};life?:any;
 weeks?:8|12;raceDate?:string|null
}):CoachLongTerm

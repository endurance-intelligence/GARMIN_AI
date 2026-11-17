export type CoachDay={
 date:string;kind:string;title:string;minutes:number|null;reason:string;
 sport:string;approvable:boolean;decision?:'accepted'|'declined'
}
export type SevenDayPlan={
 today:string;days:CoachDay[];signals:string[];flags:string[];
 attention:boolean;attentionText:string;basedOnActual:boolean;source:string;raceDate:string|null;
 returning?:boolean;ill?:boolean;postIllness?:boolean;concern?:boolean;acknowledgedRuns?:number;
 recoveryRaceDate?:string|null;checkedRecently?:boolean;reportedExhaustion?:number|null;latestWorkoutFeedback?:string|null;
 feedbackTrend?:{level:string;kind:'none'|'reduce'|'shorten'|'maintain';count14:number;count28:number}
}
export function coachAddDays(date:string,delta:number):string
export function coachMonday(date:string):string
export function buildSevenDayCoach(input:{
 today:string;startDate?:string;health?:any;boards?:any[];options?:any;plans?:any;goal?:any;life?:any;symptoms?:boolean
}):SevenDayPlan

export type CoachDay={
 date:string;kind:string;title:string;minutes:number|null;reason:string;
 sport:string;approvable:boolean
}
export type SevenDayPlan={
 today:string;days:CoachDay[];signals:string[];flags:string[];
 attention:boolean;attentionText:string;basedOnActual:boolean;source:string;raceDate:string|null;
 returning?:boolean;ill?:boolean;concern?:boolean;acknowledgedRuns?:number
}
export function coachAddDays(date:string,delta:number):string
export function coachMonday(date:string):string
export function buildSevenDayCoach(input:{
 today:string;health?:any;boards?:any[];options?:any;plans?:any;goal?:any;life?:any;symptoms?:boolean
}):SevenDayPlan

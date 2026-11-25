export type GoalProgressWeek={
 start:string;end:string;label:string;available:boolean;
 runCount:number|null;runDays:number|null;km:number|null;minutes:number|null
}
export type GoalProgressPillar={
 id:'consistency'|'longrun'|'load'|'specific';title:string;summary:string;
 detail:string;evidence:'documented'|'limited'|'unverified'
}
export type GoalProgress={
 status:'missing-goal'|'partial'|'ready';
 raceName:string|null;raceDate:string|null;distanceKm:number|null;kind:string;
 window:{start:string;end:string};weeks:GoalProgressWeek[];
 source:string;evidenceLabel:string;activeWeeks:number|null;
 runCount:number|null;runDays:number|null;totalKm:number|null;kmPerWeek:number|null;
 longest:{date:string;activityId:string;minutes:number;distanceKm:number|null}|null;
 pillars:GoalProgressPillar[];next:string;raceSoon:boolean;afterRace:boolean;note:string
}
export function analyzeGoalProgress(input:{
 today:string;goal?:any;boards?:any[];health?:any;racePortfolio?:{others?:any[]}
}):GoalProgress

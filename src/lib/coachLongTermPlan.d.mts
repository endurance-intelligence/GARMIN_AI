export type LongTermWeek={
 index:number;start:string;end:string;
 phase:'base'|'build'|'specific'|'peak'|'taper'|'race'|'recovery'|'paused'
 phaseLabel:string;focus:string;key:string;
 targetKm:{low:number;high:number}|null;longRunMinutes:number|null;
 kind:string;isCurrent:boolean;isRaceWeek:boolean;
 trainingMethod:'polarized';qualityOptions:number;polarization:string;
 status:'caution'|'race'|'draft'
}
export type LongTermPlan={
 raceName:string|null;raceDate:string|null;baselineKm:number|null;
 weeks:LongTermWeek[];hasGoal:boolean;message:string;notes:string[];
 period:string;source:string;trainingMethod:'polarized'
}
export function buildLongTermCoachPlan(input:{
 today:string;goal?:any;health?:any;life?:any;racePortfolio?:{others?:any[]};options?:unknown[];history?:import('./coachFourWeeks.mjs').CoachFourWeeks
}):LongTermPlan

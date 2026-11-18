export type RecentCoachImpact={
 status:'unavailable'|'unlinked'|'empty'|'reduce'|'observe'|'stable';
 title?:string;reason:string;evidence?:string;fresh:boolean;severe:boolean;
 daysOld:number|null;latest:{
  activityId:string;date:string;title:string;planTitle:string;plannedMinutes:number;
  actualMinutes:number;deltaMinutes:number|null;rpe:number|null;feeling:string|null
 }|null
 effect?:'none'|'protected'|'no-slot'|'shortened'|'already-conservative';
 appliedDate?:string|null;previousMinutes?:number|null;nextMinutes?:number|null;
 message?:string
}
export declare function analyzeRecentCoachImpact(input:{
 today:string;boards:any[];plans:any[]
}):RecentCoachImpact
export declare function applyRecentCoachImpact<T extends {
 date:string;kind:string;minutes:number|null;approvable:boolean;
 decision?:string;title:string;reason:string
}>(days:T[],impact:RecentCoachImpact,ctx:{
 today:string;raceDate?:string|null;ill?:boolean;returning?:boolean;postIllness?:boolean
}):{days:T[];impact:RecentCoachImpact}

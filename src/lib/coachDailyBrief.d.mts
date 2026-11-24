import type {SevenDayPlan} from './coachSevenDay.mjs'
export type CoachDailyBrief={
 date:string;kind:string;label:string;title:string;guidance:string;
 reason:string;next:string;minutes:number|null;
 race:{name:string;daysSince:number;actualKm:number|null;linkConfirmed:boolean;dataMissing:boolean}|null;
 dataNote:string;latestHealth:string|null;source:string;actionLabel:string;motive:string;
 symptomNote:string|null
}
export declare function buildCoachDailyBrief(input:{plan?:SevenDayPlan|null;health?:any;today?:string}):CoachDailyBrief|null

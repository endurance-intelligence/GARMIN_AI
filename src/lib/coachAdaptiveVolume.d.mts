import type {CoachFourWeeks} from './coachFourWeeks.mjs'
export type AdaptiveVolume={
 status:'insufficient'|'protected'|'reduce'|'maintain'|'progress';
 title:string;reason:string;changeMinutes:number;baselineKm:number|null;
 latestKm:number|null;weeksUsed:number;appliedDate:string|null;source:string;
 racePhase?:boolean
}
export declare function analyzeAdaptiveVolume(input:{
 today:string;history:CoachFourWeeks;goal?:{race_date?:string;race_name?:string}|null;
 ill?:boolean;returning?:boolean;postIllness?:boolean;symptoms?:boolean;
 caution?:boolean;feedbackCaution?:boolean;trendReducing?:boolean;
 trendShortening?:boolean;observationLimited?:boolean;
 recentImpactEffect?:string|null
}):AdaptiveVolume
export declare function applyAdaptiveVolume(days:any[],assessment:AdaptiveVolume,
 ctx:{today:string}):{days:any[];appliedDate:string|null;effect:'none'|'progress'|'reduced'}

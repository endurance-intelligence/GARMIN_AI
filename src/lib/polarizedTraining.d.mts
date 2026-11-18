export type PolarizedMethod={
 id:'polarized';name:string;easy:string;middle:string;hard:string;
 weeklyRatio:string;citation:string
}
export const POLARIZED_METHOD:PolarizedMethod
export type PolarizedGuide={
 days:any[];method:PolarizedMethod;qualityDay:string|null;
 status:'unavailable'|'protected'|'recover'|'already-chosen'|'optional-hard'|'easy-first';
 easyCount:number;message:string
}
export function applyPolarizedGuidance(days:any[],ctx?:{
 today:string;raceDate?:string|null;ill?:boolean;returning?:boolean;
 postIllness?:boolean;caution?:boolean;feedbackCaution?:boolean;
 trendReducing?:boolean;observationLimited?:boolean;qualityLocked?:boolean;
 boards?:any[];feedback?:any[]
}):PolarizedGuide

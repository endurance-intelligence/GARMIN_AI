export type AutoRaceRecovery={
 status:'missing'|'upcoming'|'outside'|'matched'|'ambiguous'|'awaiting-sync';
 raceDate:string|null;raceName:string|null;daysSince:number|null;
 phase:'none'|'race'|'rest'|'protect'|'observe'|'return'|'rebuild';
 title:string;next:string;matchStatus:'unique'|'ambiguous'|'unavailable';
 activityId:string|null;actualMinutes:number|null;actualKm:number|null;
 garminRpe:number|null;garminFeeling:number|null;
 signals:string[];recoveryCaution:boolean;healthEvidence:number;
 objectiveRecoveryUnknown:boolean;checked:boolean;
 check:{reportedOn:string;fatigue:number;soreness:number;warning:boolean}|null;
 source:string;careNote:string
}
export declare function analyzeAutoRaceRecovery(input:{
 today:string;goal?:{race_name?:string;race_date?:string;distance_km?:number}|null;
 boards?:any[];health?:any;life?:any
}):AutoRaceRecovery

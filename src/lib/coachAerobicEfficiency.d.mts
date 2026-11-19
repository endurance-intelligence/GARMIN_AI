export type AerobicEfficiency={
 status:'incomplete'|'measured';comparable:boolean;readOnly:true;
 title:string;note:string;reason:string|null;weeksLoaded:number;weeksRequested:8|12;
 recentRuns:number;previousRuns:number;hrBand:[number,number]|null;distanceBand:string|null;
 earlierPaceSecKm:number|null;recentPaceSecKm:number|null;deltaSecKm:number|null;
 speedChangePercent:number|null;previousGain:number|null;recentGain:number|null;
 earlierRpe:number|null;recentRpe:number|null;previousSeconds:number|null;recentSeconds:number|null;
 phase:string|null;goalName:string|null;selectedWeeks:string[];source:string
}
export declare function analyzeAerobicEfficiency(input:{
 today:string;weeks?:8|12;weekRows:any[];
 profile?:{zone1Min?:number|null;zones?:number[]|null}|null;
 goal?:{phase?:string;race_name?:string}|null
}):AerobicEfficiency

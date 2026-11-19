export type GarminIntensityTrendBlock={
 index:number;label:string;start:string|null;end:string|null;
 receivedWeeks:number;measuredWeeks:number;activities:number;
 measuredActivities:number;excludedActivities:number;
 activityCoverage:number|null;recordingCoverage:number|null;
 measuredSeconds:number;bands:Array<{key:string;label:string;seconds:number;share:number|null}>|null;
 ready:boolean;reason:string|null
}
export type GarminIntensityTrend={
 status:'ready'|'incomplete';comparable:boolean;
 trend:'unknown'|'similar'|'more-upper'|'less-upper'|'more-middle'|'less-middle'|'more-low'|'less-low';
 weeksRequested:8|12;blocks:GarminIntensityTrendBlock[];
 changes:{low:number;middle:number;upper:number}|null;
 goal:{name:string;raceDate:string;phase:string|null;phaseLabel:string;protected:boolean}|null;
 title:string;detail:string;readOnly:true;source:string
}
export declare function analyzeGarminIntensityTrend(input:{
 today:string;weeks?:8|12;weekRows:any[];
 profile?:{zones:number[]|null;zone1Min:number|null}|null;
 goal?:{race_name?:string;race_date?:string;phase?:string|null}|null
}):GarminIntensityTrend

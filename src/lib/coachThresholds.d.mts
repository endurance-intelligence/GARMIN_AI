export type ThresholdCalibration={
 lt1_bpm:number;lt2_bpm:number;tested_on:string;
 test_type:'lab_lactate'|'lab_ventilatory'|'field_test';
 note?:string;updated_at?:string
}
export type ThresholdBlock={
 index:number;label:string;start:string|null;end:string|null;
 receivedWeeks:number;measuredWeeks:number;activities:number;
 measuredActivities:number;measuredSeconds:number;recordingCoverage:number|null;
 activityCoverage:number|null;ready:boolean;reason:string|null;
 seconds:number[]|null;shares:(number|null)[]|null
}
export type ThresholdReport={
 status:'no-calibration'|'invalid-calibration'|'outdated'|'incomplete'|'ready';
 basis:string;weeksRequested:8|12;blocks:ThresholdBlock[];
 comparable:boolean;changes:{low:number;middle:number;high:number}|null;
 thresholdSource:string|null;isLab:boolean;testedOn:string|null;
 stale:boolean;lt1:number|null;lt2:number|null;readOnly:true;warning:string
}
export declare function validateThresholdCalibration(
 calibration:ThresholdCalibration|null,today:string
):{valid:boolean;reason:string|null;ageDays?:number;isOld?:boolean;isLab?:boolean}
export declare function analyzeThresholdIntensity(input:{
 today:string;weeks?:8|12;weekRows:any[];
 calibration?:ThresholdCalibration|null
}):ThresholdReport

export type GarminPerceptionEntry={
 activityId:string;date:string;title:string;
 rpe:number|null;feeling:number|null;feelingLabel:string|null
}
export type GarminPerception={
 source:string;count14:number;count28:number;feelingCount14:number;
 hardCount14:number;veryHardCount14:number;recentHardCount:number;
 averageRpe14:number|null;latest:GarminPerceptionEntry|null;
 level:'unknown'|'normal'|'caution'|'high';
 qualityCaution:boolean;needsRecovery:boolean;
 title:string;summary:string;advice:string
}
export function normalizeGarminRpe(value:unknown):number|null
export function normalizeGarminFeeling(value:unknown):number|null
export function garminFeelingLabel(value:unknown):string|null
export function analyzeGarminPerception(boards:any[]|undefined|null,today:string):GarminPerception

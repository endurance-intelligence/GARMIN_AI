export type GarminHrSecondsWeek={
 start:string;finish:string;totalActivities:number;measuredActivities:number;
 skippedActivities:number;validSeconds:number;measuredExpectedSeconds:number;
 histogram:Record<string,number>;readOnly:true
}
export type GarminHrZoneSummary={
 status:'insufficient'|'no-zones'|'measured';source:string;sampleBasis:string;
 validWeeks:number;missingWeeks:number;activities:number;measuredActivities:number;
 skippedActivities:number;measuredSeconds:number;zoneSeconds:number[]|null;
 zones:Array<{label:string;index:number;seconds:number;share:number;lower:number|null;upper:number|null}>;
 belowOrInZ2Share:number|null;coveredPercent:number|null;profileStatus:string
}
export declare function classifyGarminHrSeconds(weeks:GarminHrSecondsWeek[],
 profile:{zones:number[]|null;zone1Min:number|null}|null):GarminHrZoneSummary

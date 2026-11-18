export type CompletedWeekReview={
 status:'ready'|'unavailable';start:string;end:string;
 runCount:number|null;distanceKm:number|null;trainingMinutes:number|null;
 manualCount:number|null;approvedPlans:number|null;matchedCount:number|null;
 unlinkedPlans:number|null;extraRuns:number|null;
 overlongCount:number;deltaMinutes:number|null;adjustment:'shorten'|'none';
 title:string;summary:string;next:string;
 examples:Array<{title:string;date:string;plannedMinutes:number;actualMinutes:number;deltaMinutes:number}>
}
export function summarizeLastCompletedWeek(input:{
 today:string;boards?:any[];plans?:any
}):CompletedWeekReview

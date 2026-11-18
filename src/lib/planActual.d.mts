export type PlanActualActivity={
 id:string;date:string;sport:string;durationS:number|null;avgHr:number|null;
 distanceM:number|null
}
export type PlanActualPlan={
 id:string;training_date:string;title:string;sport:string;state:string;
 archive_snapshot?:{
  sourceKind?:string;coachKind?:string;startTime?:string;
  warmup?:{durationSeconds?:number};cooldown?:{durationSeconds?:number};
  group?:{steps?:Array<{endMode?:string;durationSeconds?:number}>}
 }|null
}
export type PlanActualMatch={
 status:'matched'|'no-plan'|'no-link'|'unavailable'|'ambiguous'|'possible'|'unsupported'
 reason:string
 plan:null|{
  id:string;title:string;day:string;coachKind:string;
  plannedStart:string;actualStart:string;plannedSeconds:number;actualSeconds:number|null;
  plannedMinutes:number|null;actualMinutes:number|null;durationDeltaMinutes:number|null;
  avgHr:number|null;distanceM:number|null;activityId:string;startDeltaMinutes:number
 }
}
export function assessPlanActual(activity:PlanActualActivity|null,
 allActivities:PlanActualActivity[],allPlans:PlanActualPlan[]):PlanActualMatch

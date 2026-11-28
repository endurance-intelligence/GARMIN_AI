export type PlanActualActivity={
 id:string;date:string;sport:string;durationS:number|null;avgHr:number|null;
 distanceM:number|null
}
export type PlanActualPlan={
 id:string;training_date:string;title:string;sport:string;state:string;
 revision?:number;intervals_published_revision?:number|null;intervals_sync_status?:string;intervals_event_id?:number|null;
 archive_snapshot?:{
  sourceKind?:string;coachKind?:string;startTime?:string;
  warmup?:{durationSeconds?:number};cooldown?:{durationSeconds?:number};
  group?:{name?:string;notes?:string;steps?:Array<{kind?:string;endMode?:string;durationSeconds?:number|null;distanceMeters?:number|null;paceSecondsPerKm?:number|null;notes?:string}>}
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

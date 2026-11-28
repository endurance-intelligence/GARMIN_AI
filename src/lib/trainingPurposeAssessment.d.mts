import type {IntervalTargetComparison} from './intervalTargetComparison.mjs'
import type {PlanActualMatch} from './planActual.mjs'
import type {SessionSample} from './sessionAnalysis'
export type PurposeReview={activityId:string;type:string;quality:string;intervals?:Array<{repeat?:number;distanceM:number;durationS:number|null;paceSeconds:number;avgHr:number|null}>}
export type PurposeZoneReference={activityId:string;source:'intervals-current';upperBpm:number}
export type PurposeAssessment={kind:string;verdict:string;mode:'caution'|'review'|'positive';mood:'firm'|'supportive'|'focused';modeLabel:string;recommendation:string;next:string;evidence:Array<{label:string;value:string;detail:string}>}
export function measuredHrExposure(samples:SessionSample[],upperBpm:number):{aboveShare:number;aboveSeconds:number;validSeconds:number;coverage:number;upperBpm:number}|null
export function assessTrainingPurpose(input:{activity?:{id:string;name?:string;sport?:string};match?:PlanActualMatch|null;review?:PurposeReview|null;samples?:SessionSample[];zoneReference?:PurposeZoneReference|null;rpe?:number|null;intervalComparison?:IntervalTargetComparison|null}):PurposeAssessment|null

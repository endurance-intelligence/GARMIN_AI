import type {IntervalTargetComparison} from './intervalTargetComparison.mjs'
import type {PurposeAssessment,PurposeReview,PurposeZoneReference} from './trainingPurposeAssessment.mjs'
import type {PlanActualMatch} from './planActual.mjs'
import type {SessionSample} from './sessionAnalysis'
export type SessionContextActivity={id:string;name?:string;date:string;sport:string;distanceM:number|null;durationS:number|null;avgHr:number|null;rpeRaw:number|null}
export type TerrainWindow={startDistanceM:number;endDistanceM:number;gradePct:number}
export function buildSessionContext(activity:SessionContextActivity,list?:SessionContextActivity[],terrain?:TerrainWindow[],felt?:number|{felt:number;temperature:number;location:string;hour:string}|null,purposeInput?:{match?:PlanActualMatch|null;review?:PurposeReview|null;samples?:SessionSample[];zoneReference?:PurposeZoneReference|null;intervalComparison?:IntervalTargetComparison|null}|null):{purpose:PurposeAssessment|null;verdict:string;mood:'firm'|'reflective'|'supportive'|'focused';mode:'caution'|'review'|'positive';modeLabel:string;recommendation:string|null;factors:{label:string;text:string}[];cards:{key:string;label:string;icon:string;value:string;unit:string;tone:string;status:string;detail:string}[];paceText:string;next:string}

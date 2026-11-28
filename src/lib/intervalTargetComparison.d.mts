import type {PlanActualActivity,PlanActualPlan} from './planActual.mjs'
import type {PurposeReview} from './trainingPurposeAssessment.mjs'
export type IntervalTargetRow={repeat:number;targetDistance:number;actualDistance:number;targetPace:number|null;actualPace:number;actualDuration:number;avgHr:number|null;delta:number|null;tolerance:number|null;status:'near'|'fast'|'slow'|'reference-only'}
export type IntervalTargetComparison={status:'unavailable';reason:string;rows:IntervalTargetRow[];group:string|null;planTitle:string|null;expected:number|null;observed:number|null}|{status:'plausible';reason:string;rows:IntervalTargetRow[];group:string;planTitle:string;expected:number;observed:number;near:number;fast:number;slow:number;judged:number;fade:boolean}
export function compareIntervalTargets(input:{activity:PlanActualActivity;activities:PlanActualActivity[];plans:PlanActualPlan[];review:PurposeReview|null}):IntervalTargetComparison
export function intervalTargetVerdict(comparison?:IntervalTargetComparison|null):{headline:string;text:string;mode:'caution'|'positive'|'review';next:string}|null

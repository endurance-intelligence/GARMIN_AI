import type {CoachDay,SevenDayPlan} from './coachSevenDay.mjs'
export type CoachDecision={
 day:CoachDay;headline:string;summary:string;current:string;proposal:string;
 state:'review'|'calendar'|'completed'|'no-write';actionable:boolean;
 reason:string;causes:{key:'training'|'recovery'|'goal';title:string;text:string}[];
 flags:string[];attentionText:string
}
export function selectCoachDecision(plan:SevenDayPlan|null|undefined):CoachDecision|null

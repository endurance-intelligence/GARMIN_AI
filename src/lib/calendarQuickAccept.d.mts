import type {SevenDayPlan} from './coachSevenDay.mjs'
export type QuickCoachAction='rest'|'draft'|'choose'|null
export function quickCoachAction(plan:SevenDayPlan|null|undefined,date:string,today:string):QuickCoachAction

export type QuickDecisionChoice='accepted'|'open'|'declined'
export function quickDecisionAvailable(plan:SevenDayPlan|null|undefined,date:string,today:string):boolean

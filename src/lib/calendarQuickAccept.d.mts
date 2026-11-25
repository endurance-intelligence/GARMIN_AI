import type {SevenDayPlan} from './coachSevenDay.mjs'
export type QuickCoachAction='rest'|'draft'|'choose'|null
export function quickCoachAction(plan:SevenDayPlan|null|undefined,date:string,today:string):QuickCoachAction

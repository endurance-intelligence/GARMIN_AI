import type {SevenDayPlan} from './coachSevenDay.mjs'
import type {RecoveryDay} from './recoveryComparison'
export type RecoveryAdvice={level:'pause'|'rest'|'limited'|'caution'|'balanced';title:string;advice:string;tip:string;evidence:string;planText:string;bodyCheck:string;comparable:number;latestDay:string|null}
export function coachRecoveryAdvice(input:{today:string;history?:RecoveryDay[];plan?:SevenDayPlan|null;context?:unknown;training?:unknown;completed?:boolean}):RecoveryAdvice

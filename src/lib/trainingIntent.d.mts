import type {CoachDay} from './coachSevenDay.mjs'
export type QualityIntent='planned'|'candidate'
export function qualityIntent(day:CoachDay,ctx?:{qualityDay?:string|null;protectedPhase?:boolean}):QualityIntent|null
export function savedQualityIntent(plan:unknown):QualityIntent|null
export function qualityPresentation(intent:QualityIntent|null|undefined):{label:string;description:string}|null
export function plannedSupplementDays(input:any):{rowingTarget:number|null;strengthTarget:number|null}

export function protectQualitySlots(days:import('./coachSevenDay.mjs').CoachDay[],plans:unknown[],roadmap:unknown[],context:{today:string;qualityDay?:string|null}):Array<import('./coachSevenDay.mjs').CoachDay&{qualitySlotBlocked?:boolean}>

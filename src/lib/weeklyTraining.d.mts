import type {CoachDay} from './coachSevenDay.mjs'
export type WeeklyBudget={start:string;end:string;current:boolean;phase:string;phaseLabel:string;target:{low:number;high:number}|null;actualKm:number|null;approvedKm:number;draftKm:number;suggestedKm:number;forecastKm:number|null;unknown:number;paceSeconds:number|null;gapKm:number|null;longRunMinutes:number|null;longestActualMinutes:number|null;qualityOptions:number;qualityPlanned:number;qualityCandidates:number;rowingDays:number|null;strengthDays:number|null;rowingTarget:number|null;strengthTarget:number|null;focus:string;proposedParts:{date:string;km:number|null;minutes:number}[]}
export function weekStart(date:string):string
export function trainingWeekBaseline(history:unknown,raceDates?:string[]):number|null
export function buildWeeklyBudget(input:any):WeeklyBudget|null
export function replacementImpact(budget:WeeklyBudget|null|undefined,date:string):{allowed:boolean;removedKm:number|null;afterKm:number|null;reason:string}
export function protectRhythmReplacements(original:CoachDay[],proposed:CoachDay[],budgetFor:(days:CoachDay[],date:string)=>WeeklyBudget|null):CoachDay[]

export function allocateWeeklyRunning(days:CoachDay[],budgetFor:(days:CoachDay[],date:string)=>WeeklyBudget|null,context:{today:string;protectedPhase?:boolean;volumeStatus?:string;alreadyAdjusted?:boolean}):{days:CoachDay[];changes:{date:string;from:number;to:number;reason:string}[]}

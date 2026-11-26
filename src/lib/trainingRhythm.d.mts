export type TrainingRhythm={rowing:{days:number[];minutes:number};strength:{days:number[];minutes:number}}
export type RhythmEntry={kind:'rowing'|'strength';title:string;minutes:number;status:'paused'|'done'|'suggested';reason:string}
export const DEFAULT_RHYTHM:TrainingRhythm
export const RHYTHM_KEY:string
export function normalizeRhythm(value:unknown):TrainingRhythm|null
export function readRhythm():TrainingRhythm
export function saveRhythm(value:TrainingRhythm):TrainingRhythm
export function applyTrainingRhythm(days:import('./coachSevenDay.mjs').CoachDay[],rhythm:unknown,context?:any):import('./coachSevenDay.mjs').CoachDay[]

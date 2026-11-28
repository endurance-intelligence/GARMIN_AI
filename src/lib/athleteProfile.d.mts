export type AthleteProfile={sports:string[];daysPerWeek:number|null;sessionMinutes:number|null;preferredDays:number[];level:string|null;goal:string|null;cycleEnabled:boolean}
export const ATHLETE_SPORTS:Array<[string,string]>
export const ATHLETE_LEVELS:Array<[string,string]>
export const ATHLETE_GOALS:Array<[string,string]>
export function emptyAthleteProfile():AthleteProfile
export function normalizeAthleteProfile(value:unknown):AthleteProfile|null
export function cycleAvailability(value:unknown):'schema-review'|'unavailable'

export type ProfileFieldAvailability={heightCandidate:boolean;ageCandidate:boolean;sexCandidate:boolean;weightCandidate:boolean}
export function profileFieldAvailability(value:unknown):ProfileFieldAvailability

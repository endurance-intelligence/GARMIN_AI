export type HealthPreferences={heightCm:number|null;birthYear:number|null;adultConfirmed:boolean;weighReminder:'off'|'daily'|'three-weekly'}
export function emptyHealthPreferences():HealthPreferences
export function normalizeHealthPreferences(value:unknown,today:string):HealthPreferences|null
export function adultBmi(kg:unknown,prefs:unknown,today:string):number|null
export function weighReminderDue(prefs:unknown,today:string,dates:unknown,dismissedDate:unknown):boolean
export function explicitGarminProfile(raw:unknown):Pick<HealthPreferences,'heightCm'|'birthYear'>

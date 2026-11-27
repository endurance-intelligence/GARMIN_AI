export type SleepDetail=Partial<Record<'deepSeconds'|'lightSeconds'|'remSeconds'|'awakeSeconds'|'score'|'sleepStress',number>>
export function sanitizeSleep(value:unknown):SleepDetail|null
export function normalizeGarminSleep(value:unknown):SleepDetail|null
export function mergeSleepMetrics(raw:unknown,update:unknown):Record<string,unknown>
export function publicRecoveryRow<T extends {raw_metrics?:unknown}>(row:T):Omit<T,'raw_metrics'>&{sleepDetail:SleepDetail|null}
export function completedDaySignal(history:Array<{metric_date:string;stress_avg?:number|null;body_battery_max?:number|null}>,today:string,key:'stress_avg'|'body_battery_max'):{date:string;value:number|null;base:number|null;delta:number|null;sampleCount:number}|null
export function sleepDetailEvidence(history:Array<{metric_date:string;sleepDetail?:SleepDetail|null}>,today:string):{text:string;disrupted:boolean}
export function sleepComposition(value:unknown):{total:number;stages:Array<[string,number]>}|null

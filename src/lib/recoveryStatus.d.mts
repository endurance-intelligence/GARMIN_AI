export type RecoveryStatus={tone:'usual'|'mild'|'notice'|'unknown'|'higher';label:string;emoji:string}
export function recoveryStatus(metric:string,value:unknown,baseline:unknown,options?:{fresh?:boolean}):RecoveryStatus
export function sleepScoreStatus(history:unknown,today:string):RecoveryStatus

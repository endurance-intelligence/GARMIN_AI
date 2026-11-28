export type RecoveryResponseGroup={count:number;weeks:number;hrvDelta:number;pulseDelta:number}
export function coachRecoveryResponse(input:{today:string;boards:unknown;health:unknown}):{low:RecoveryResponseGroup;high:RecoveryResponseGroup}|null

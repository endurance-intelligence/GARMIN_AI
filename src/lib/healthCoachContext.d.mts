export type HealthCoachContext={title:string;text:string;weightChange:number;weightCounts:number[];signals:string[]}
export function healthCoachContext(input:{today:string;weights:unknown;health:unknown;adultConfirmed:boolean}):HealthCoachContext|null

export type HealthPoint={date:string;value:number}
export function shiftDay(date:string,days:number):string
export function healthOverview(rows:unknown,today:string):{key:string;latest:HealthPoint|null;median:number|null;count:number;points:HealthPoint[]}[]
export function weightHistory(rows:unknown,today:string):HealthPoint[]

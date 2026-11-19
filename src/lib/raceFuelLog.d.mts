export type FuelMarkStatus='planned'|'different'|'skipped'
export type FuelMarks=Record<string,FuelMarkStatus>
export declare const FUEL_MARK_STATUSES:FuelMarkStatus[]
export declare function validFuelMarks(marks:unknown,input:{completed:number;total:number}):FuelMarks|null
export declare function updateFuelMark(marks:FuelMarks,input:{
 round:number;completed:number;total:number;status:FuelMarkStatus|null
}):{ok:boolean;reason:string|null;marks:FuelMarks}
export declare function recentFuelFeedback(marks:FuelMarks,input:{
 completed:number;total:number
}):{round:number;status:FuelMarkStatus;text:string;confirmedByUser:true}|null

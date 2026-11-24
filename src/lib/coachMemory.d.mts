export type CoachMemoryEntry={
 id:string;date:string;title:string;state:'draft'|'pending'|'confirmed'|'cancelled';
 kind:string|null;plannedMinutes:number|null;reason:string|null;
 outcome:'matched'|'draft'|'cancelled'|'unavailable'|'unlinked';
 actual:{minutes:number|null;distanceKm:number|null;rpe:number|null;feeling:string|null}|null
}
export type CoachMemory={
 status:'ready'|'unavailable';historyFrom:string|null;entries:CoachMemoryEntry[];
 decisions:{date:string;choice:'accepted'|'declined'}[];totalEntries:number;totalDecisions:number
}
export declare function boundedCoachReason(value:unknown):string
export declare function buildCoachMemory(input:{today:string;snapshot:unknown}):CoachMemory

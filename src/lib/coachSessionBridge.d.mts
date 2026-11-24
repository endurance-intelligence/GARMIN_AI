import type {PlanActualMatch} from './planActual.mjs'
export type CoachSessionBridgeItem={
 id:string;title:string;date:string;durationMinutes:number|null;
 distanceKm:number|null;avgHr:number|null;rpe:number|null;feeling:string|null;
 match:PlanActualMatch
}
export type CoachSessionBridge={
 status:'ready'|'empty'|'unavailable';items:CoachSessionBridgeItem[];
 totalRuns:number|null;matchedCount:number|null
}
export declare function buildCoachSessionBridge(input:{
 boards:Array<{activities?:unknown[]}>;plans:unknown[];today:string;limit?:number|null
}):CoachSessionBridge

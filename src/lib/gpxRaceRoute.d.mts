export type Point=[number,number]|[number,number,number]
export function haversine(a:Point,b:Point):number
export function bearing(a:Point,b:Point):number
export function parseGpxTrack(xml:string):{
 points:Point[];originalPoints:number;distanceM:number;ascentM:number;descentM:number
}
export function routeSvg(points:Point[],width?:number,height?:number):{
 positions:number[][];polyline:string;cumulative:number[];totalM:number
}|null
export function windSegments(points:Point[],windFromDeg:number,windKmh:number,minimumKmh?:number):{
 fromKm:number;toKm:number;headwindKmh:number
}[]

export type CourseCheckpoint={fraction:number;km:number;latitude:number;longitude:number;label:string}
export function checkpointsFromTrack(points:number[][]):CourseCheckpoint[]
export function stageWeatherAt<T extends {hours:Array<{epoch:number}>}>(forecast:T|null,startEpoch:number,fraction:number,targetHours:number):T['hours'][number]|null

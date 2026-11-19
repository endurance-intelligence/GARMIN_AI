export type RacePreflightItem={id:string;status:'ok'|'review'|'blocked';label:string;detail:string}
export type RacePreflightResult={status:'ready'|'review'|'blocked';checks:RacePreflightItem[];
 blocked:number;review:number;raceLogUntouched:true;caveat:string}
export declare function runRaceDayPreflight(input:{
 storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>|null;
 key?:string;raceDate?:string;raceName?:string;total?:number;
 expectedCompleted?:number;loaded?:boolean;storageReady?:boolean;
 saved?:boolean;startTime?:string;
 gelEvents?:unknown[]|null;aidEvents?:unknown[]|null
}):RacePreflightResult

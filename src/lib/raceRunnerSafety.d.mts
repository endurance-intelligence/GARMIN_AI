export type RunnerSnapshot={ok:boolean;reason:string|null;marks?:Record<string,any>;
 completed?:number;lastTapAt?:number|null;startTime?:string|null}
export declare const RUNNER_TAP_GUARD_MS:number
export declare function validateRunnerSnapshot(snapshot:any,input:{
 raceDate:string;raceName:string;total:number
}):RunnerSnapshot
export declare function assessRunnerAdvance(input:{
 completed:number;total:number;lastTapAt?:number|null;now:number
}):{ok:boolean;reason:string|null;next?:number;stamp?:number}
export declare function assessRunnerCorrection(input:{
 count:number;total:number;recorded:number
}):{ok:boolean;reason:string|null;count?:number}

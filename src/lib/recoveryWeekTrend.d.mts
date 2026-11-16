export type RecoveryWeekTrend={
 metrics:Record<string,{current:number;previous:number;lastCount:number;previousCount:number}>;
 status:'lower'|'higher'|'stable'|null;from:string;to:string;previousFrom:string;previousTo:string
}
export function recoveryWeekTrend(rows:unknown[],date:string):RecoveryWeekTrend|null

export type WeightTrendRow={weigh_date:string;weight_kg:number|string}
export type WeightWindow={median:number;count:number}
export type WeightTrendResult={
 latest:[string,number]|null;seven:WeightWindow|null;month:WeightWindow|null;
 change:{current:number;previous:number;change:number}|null;
 monthlyChange:number|null;entries:number
}
export function weightTrend(rows:WeightTrendRow[],asOf:string):WeightTrendResult|null

export type WindExplainer={
 label:string;tone:'calm'|'notice'|'caution'|'warning';guidance:string
}
export function explainRaceGust(gustKmh:number,minTempC:number|null):WindExplainer|null

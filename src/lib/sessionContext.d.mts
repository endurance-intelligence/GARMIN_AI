export type SessionContextActivity={id:string;date:string;sport:string;distanceM:number|null;durationS:number|null;avgHr:number|null;rpeRaw:number|null}
export type TerrainWindow={startDistanceM:number;endDistanceM:number;gradePct:number}
export function buildSessionContext(activity:SessionContextActivity,list?:SessionContextActivity[],terrain?:TerrainWindow[],felt?:number|{felt:number;temperature:number;location:string;hour:string}|null):{verdict:string;mood:'reflective'|'supportive'|'focused';factors:{label:string;text:string}[];next:string}

export type GoalRouteSummary={raceName:string;raceDate:string;eventKind?:string;courseType?:string|null;venue?:string|null;venueAddress?:string|null;startLatitude?:number|null;startLongitude?:number|null;ascentM?:number|null;routeUrl?:string|null}
export function routeSummaryLabels(route:GoalRouteSummary|null|undefined){
 if(!route)return {kind:null,course:null,start:null,ascent:null}
 const course:Record<string,string>={out_and_back:'Hin und zurück',loop:'Rundkurs',point_to_point:'A nach B',multi_loop:'Mehrere Runden'}
 const hasGps=typeof route.startLatitude==='number'&&Number.isFinite(route.startLatitude)&&typeof route.startLongitude==='number'&&Number.isFinite(route.startLongitude)
 const venue=route.venueAddress||route.venue||null
 return {kind:route.eventKind==='challenge'?'Eigene Challenge':null,course:course[route.courseType||'']||null,
 start:venue==='GPS-Startpunkt der Komoot-Tour'&&hasGps?'GPS-Startpunkt hinterlegt':venue||(hasGps?'GPS-Startpunkt hinterlegt':null),
 ascent:typeof route.ascentM==='number'&&Number.isFinite(route.ascentM)?route.ascentM.toLocaleString('de-DE')+' hm':null}
}

export type RaceEstimate={movingMinutes:number;breakMinutes:number;totalMinutes:number;
 rounds:number|null;normalStops:number|null;extraStops:number;formattedTotal:string}
export function estimateRaceStrategy(input:{distanceKm:number;courseMode:string;
 loopKm:number|null;movingMinutes:number|null;regularPauseMinutes:number|null;
 longStopEvery:number|null;longStopMinutes:number|null;paceSeconds:number|null}):RaceEstimate|null

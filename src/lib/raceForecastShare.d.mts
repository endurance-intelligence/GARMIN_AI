export type RaceForecastStatus={days:number|null;label:string;tone:'missing'|'past'|'near'|'medium'|'far';description:string}
export type RaceShareSummary={temp:[number,number]|number[]|null;rain:number;gust:number;changes:string[]}
export type RaceShareStage={label:string;weather:{hour:number;temperature:number;rainProbability:number;gust:number}}
export function raceForecastStatus(raceDate:string,today:string,hasHours:boolean):RaceForecastStatus
export function formatRaceWeatherShare(data:{
 race:{race_name:string;race_date:string;race_start_time:string|null};
 info:RaceShareSummary;status:RaceForecastStatus;place:string;finish?:string|null;
 pointToPoint?:boolean;stages?:RaceShareStage[];windTip?:string|null;fetchedAt:number
}):string

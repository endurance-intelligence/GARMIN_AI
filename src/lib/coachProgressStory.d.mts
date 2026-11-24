export type CoachProgressStory={
 status:'complete'|'limited';
 window:{start:string;end:string};
 weeks:Array<{start:string;end:string;km:number|null;available:boolean;runDays:number|null}>;
 knownWeeks:number;activeWeeks:number|null;totalKm:number|null;runDays:number|null;
 longest:{minutes:number;distanceKm:number|null;date:string}|null;
 trend:string;trendText:string;previousTwoKm:number|null;recentTwoKm:number|null;
 percentChange:number|null;ratedRuns:number|null;totalRuns:number|null;
 loadCaution:boolean;loadNote:string;next:string;performanceStatus:string;
 performanceNote:string;caveat:string
}
export declare function buildCoachProgressStory(input:{today:string;snapshot:any}):CoachProgressStory|null

export type DayActivity={
 count:number;minutes:number;
 items:Array<{title:string;minutes:number;source:string}>;title:string|null
}
export function summarizeDayActivity(board:unknown,date:string):DayActivity
export function dayCoachHeadline(choice:{skipped?:boolean;skippedTitle?:string;plan?:unknown}|null|undefined,day:DayActivity|null):{title:string;status:string;note:string}|null

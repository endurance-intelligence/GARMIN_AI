import type {GelPlanEvent} from './gelTiming.mjs'
import type {AidPlanEvent} from './raceAidPlan.mjs'
import type {RaceCheckpoint} from './raceExecution.mjs'
export type RunnerFocus={
 total:number;completed:number;remaining:number;nextIndex:number|null;
 finished:boolean;longPause:boolean;breakNote:string|null;
 gel:GelPlanEvent|null;gelTiming:'due'|'upcoming'|'loading'|'none';
 drinkDue:boolean;nextAid:AidPlanEvent|null;timingSource:'clock'|'approximate';planOnly:true
}
export declare function buildRunnerFocus(input:{
 checkpoints?:RaceCheckpoint[];completed?:number;gelEvents?:GelPlanEvent[]|null;
 aidEvents?:AidPlanEvent[]|null;
 elapsedMinutes?:number|null
}):RunnerFocus

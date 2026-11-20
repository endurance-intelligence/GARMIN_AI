import type {RaceFuelRoadmap} from './raceFuelRoadmap.mjs'
import type {EventMenu} from './raceEventMenu.mjs'
export type CrewBackup={
 status:'ready'|'partial'|'missing';text:string;roundCount:number;
 warnings:string[]
}
export declare function buildRaceCrewBackup(input:{
 raceName?:string;raceDate?:string;startTime?:string;
 roadmap?:RaceFuelRoadmap|null;eventMenu?:EventMenu|null;
 gelScheduleReady?:boolean;aidScheduleReady?:boolean;planSaved?:boolean
}):CrewBackup

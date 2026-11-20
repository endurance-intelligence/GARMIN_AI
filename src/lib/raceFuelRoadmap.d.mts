export type RaceFuelRoadmapRound={
 round:number;finish:boolean;phase:'early'|'middle'|'late';
 phaseName:string;breakType:'finish'|'long'|'short';pauseName:string;
 coachHint:string;arrivalMinutes:number;pauseMinutes:number;
 primary:string|null;primaryKind:'food'|'gel'|null;
 alternative:string|null;foodConfirmed:boolean;menuAvailable:boolean;foodIsAdditional:boolean;
 gelNames:string[];gelCount:number;gelCarbsG:number;foodCarbsG:number;
 drinkCarbsG:number;knownCarbsG:number;
 lapMinutes:number;ownDrinkCarbsG:number;plannedTotalCarbsG:number;
 targetCarbsG:number|null;openCarbsG:number|null;
 caffeineMg:number;drink:string|null;
 sourceStatus:'loading'|'partial'|'unconfirmed';planOnly:true
}
export type RaceFuelRoadmap={
 status:'ready'|'missing';rounds:RaceFuelRoadmapRound[];
 totals?:{rounds:number;longStops:number;gelCount:number;gelCarbsG:number;
  foodCarbsG:number;drinkCarbsG:number;ownDrinkCarbsG:number;
  plannedTotalCarbsG:number;targetCarbsG:number|null;openCarbsG:number|null;
  caffeineMg:number};
 note?:string;planOnly:true
}
export declare function buildRaceFuelRoadmap(input:{
 checkpoints?:import('./raceExecution.mjs').RaceCheckpoint[];
 gelEvents?:import('./gelTiming.mjs').GelPlanEvent[]|null;
 aidEvents?:import('./raceAidPlan.mjs').AidPlanEvent[]|null;
 eventMenu?:import('./raceEventMenu.mjs').EventMenu|null;
 targetCarbsGPerHour?:number|null;ownDrinkCarbsGPerHour?:number
}):RaceFuelRoadmap

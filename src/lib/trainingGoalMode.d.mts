export type TrainingGoalMode={mode:'race'|'maintenance'|'choose';weeklyKm:number|null;activeRaceDate:string|null}
export declare function getTrainingGoalMode(goal:unknown,today:string):TrainingGoalMode

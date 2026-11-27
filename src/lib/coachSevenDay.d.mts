export type CoachDay={
 date:string;kind:string;title:string;minutes:number|null;reason:string;
 sport:string;approvable:boolean;decision?:'accepted'|'declined';
 selectedGroup?:{code:string;title:string;startTime:string|null;location:string|null;advice:'skip'|'easy'|'review';reason:string};
 recoveryMobility?:boolean;
 rhythm?:import('./trainingRhythm.mjs').RhythmEntry[];
 qualityIntent?:import('./trainingIntent.mjs').QualityIntent;
 qualityBlocked?:boolean;
 clubQualitySlot?:boolean;
 qualityArchive?:{templateId:string;group:string;title:string;totalMeters:number;effortMeters:number;efforts:number;recoveryMeters:number;warmupMeters:number;cooldownMeters:number;steps:Array<{kind:string;distanceMeters:number;paceSecondsPerKm:number|null;endMode:string}>};
 weeklyAdjustment?:{from:number;to:number};
 intensityIntent?:'low'|'low-option'|'hard-option'|'quality'
}
export type SevenDayPlan={
 today:string;days:CoachDay[];signals:string[];flags:string[];
 attention:boolean;attentionText:string;basedOnActual:boolean;source:string;raceDate:string|null;
 archivedLearning?:{status:string;title:string;summary:string;completeWeeks:number;targetWeeks:number;overloadWeeks:number;caution:boolean;appliedDate:string|null;weeks:{start:string;end:string;status:string;originalKm:number|null;plannedKm:number|null;actualKm:number|null;deltaKm:number|null;targetHigh:number|null;targetDeltaKm:number|null;rated:number;strained:number;overload:boolean}[]};
 weeklyAllocation?:{date:string;from:number;to:number;reason:string}[];
 weeklyBudgets?:import('./weeklyTraining.mjs').WeeklyBudget[];
 goalProfile?:import('./goalTrainingFocus.mjs').GoalProfile;
 supplement?:import('./goalTrainingFocus.mjs').GoalSupplement;
 alternatives?:import('./goalTrainingFocus.mjs').GoalSupplementSuggestion[];
 returning?:boolean;ill?:boolean;postIllness?:boolean;concern?:boolean;acknowledgedRuns?:number;
 trainingGoalMode?:import('./trainingGoalMode.mjs').TrainingGoalMode;
 recoveryRaceDate?:string|null;checkedRecently?:boolean;reportedExhaustion?:number|null;latestWorkoutFeedback?:string|null;
 feedbackTrend?:{level:string;kind:'none'|'reduce'|'shorten'|'maintain';count14:number;count28:number}
 garminPerception?:import('./garminPerception.mjs').GarminPerception
 nextImpact?:import('./coachNextImpact.mjs').RecentCoachImpact
 completedWeek?:import('./completedWeekReview.mjs').CompletedWeekReview
 fourWeekReview?:import('./coachFourWeeks.mjs').CoachFourWeeks
 adaptiveVolume?:import('./coachAdaptiveVolume.mjs').AdaptiveVolume
 autoRaceRecovery?:import('./raceRecoveryIntelligence.mjs').AutoRaceRecovery
 trainingMethod?:{id:'polarized';qualityDay:string|null;status:string;plannedEasy:number;message:string}
}
export function coachAddDays(date:string,delta:number):string
export function coachMonday(date:string):string
export function buildSevenDayCoach(input:{
 today:string;startDate?:string;health?:any;boards?:any[];options?:any;plans?:any;goal?:any;goalRoute?:import('./goalTrainingFocus.mjs').GoalRouteEvidence|null;racePortfolio?:{others?:any[]};life?:any;symptoms?:boolean
}):SevenDayPlan

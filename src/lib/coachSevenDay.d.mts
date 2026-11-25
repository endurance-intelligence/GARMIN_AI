export type CoachDay={
 date:string;kind:string;title:string;minutes:number|null;reason:string;
 sport:string;approvable:boolean;decision?:'accepted'|'declined';
 selectedGroup?:{code:string;title:string;startTime:string|null;location:string|null;advice:'skip'|'easy'|'review';reason:string};
 intensityIntent?:'low'|'low-option'|'hard-option'
}
export type SevenDayPlan={
 today:string;days:CoachDay[];signals:string[];flags:string[];
 attention:boolean;attentionText:string;basedOnActual:boolean;source:string;raceDate:string|null;
 goalProfile?:import('./goalTrainingFocus.mjs').GoalProfile;
 supplement?:import('./goalTrainingFocus.mjs').GoalSupplement;
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

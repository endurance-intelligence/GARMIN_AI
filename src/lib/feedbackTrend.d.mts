import type {WorkoutFeedback} from './postWorkoutFeedback.mjs'
export type WorkoutFeedbackTrend={
 level:'insufficient'|'high'|'caution'|'stable'|'neutral'
 kind:'none'|'reduce'|'shorten'|'maintain'
 count14:number;count28:number;highRpe14:number;heavyLegs14:number
 lightSymptoms14:number;clearSymptoms14:number;harder14:number;averageRpe14:number|null
 title:string;summary:string;suggestion:string;evidence:string[]
}
export function analyzeWorkoutFeedbackTrend(feedback:WorkoutFeedback[]|undefined|null,today:string):WorkoutFeedbackTrend

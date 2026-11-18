export type WorkoutFeedback={
 activityId:string;activityDate:string;activityName:string;reportedOn:string;rpe:number;
 legs:'fresh'|'ok'|'tired'|'heavy'|'destroyed';symptoms:'none'|'light'|'clear';
 feel:'easier'|'as_expected'|'harder';note:string
}
export function evaluateWorkoutFeedback(feedback:WorkoutFeedback):{
 level:'missing'|'warning'|'high'|'caution'|'ok';title:string;message:string;
 avoidHard:boolean;preferRest:boolean
}
export function latestWorkoutFeedback(feedback:WorkoutFeedback[]|undefined|null,today:string):WorkoutFeedback|null

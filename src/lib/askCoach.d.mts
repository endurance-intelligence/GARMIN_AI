import type {SevenDayPlan} from './coachSevenDay.mjs'
export type CoachTopic='today'|'recovery'|'progress'|'goal'|'week'|'memory'|'symptoms'|'weather'|'lastRun'|'volume'|'load'|'method'
export type CoachAnswer={title:string;body:string[];source:string;action:'decision'|'progress'|'goals'|'symptoms'|null}
export declare const COACH_QUESTIONS:Array<{id:CoachTopic;label:string}>
export declare function resolveCoachQuestion(raw:unknown):CoachTopic|null
export declare function answerCoachQuestion(input:{topic:CoachTopic|null;today:string;snapshot:unknown;plan:SevenDayPlan|null;weather?:{date:string;text:string}|null;query?:string;previousQuery?:string}):CoachAnswer

import type {SevenDayPlan} from './coachSevenDay.mjs'
import type {CoachTopic} from './askCoach.mjs'
export type CoachMood='neutral'|'friendly'|'firm'|'supportive'|'focused'|'reflective'|'celebrate'
export function coachMood(plan:SevenDayPlan|null,today?:string):CoachMood
export function resolveFollowUp(query:string,previousTopic:CoachTopic|null,resolve:(q:string)=>CoachTopic|null):CoachTopic|null

export function coachChatMood(topic?:CoachTopic|null,pending?:boolean):CoachMood

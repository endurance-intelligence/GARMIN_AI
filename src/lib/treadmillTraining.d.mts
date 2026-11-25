import type {GoalProfile,GoalSupplementSuggestion} from './goalTrainingFocus.mjs'
export type TreadmillSegment={label:string;minutes:number;incline:number;intensity:string}
export type TreadmillSession={kind:'treadmill-hike'|'treadmill-run';title:string;minutes:number;intensity:string;segments:TreadmillSegment[];reason:string;note:string}
export function buildTreadmillSession(input:{equipment?:unknown;profile?:GoalProfile;minutes?:number;preferHills?:boolean}):TreadmillSession|null

export type CustomAssessment={level:'invalid'|'blocked'|'against'|'review'|'aligned';
 title:string;message:string;canSave:boolean;requiresAcknowledgment:boolean}
export function assessCustomProposal(input:{
 day:{date:string;kind:string;minutes:number|null;approvable:boolean;decision?:'accepted'|'declined'};
 plan:{raceDate:string|null;signals:string[]};
 kind:'run'|'walk'|'rowing'|'mobility';minutes:number;goal?:{race_name?:string}|null
}):CustomAssessment

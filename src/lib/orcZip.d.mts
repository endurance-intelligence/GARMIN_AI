export type OrcSourceEntry={id:string;number:number;sourceImage:string;sourceImageSha256:string;sourceKind:'orc_reference';category:string;workout:import('./workoutLibrary').TrainerWorkout;individualRule:Record<string,unknown>;sourceNotes:string;reviewRequired:boolean}
export function readOrcZip(blob:Blob):Promise<{manifest:{entries:OrcSourceEntry[]};rows:{archiveRow:{id:string};image:{bytes:Uint8Array;contentType:string}}[]}>
export function encodeOrcImage(bytes:Uint8Array):string

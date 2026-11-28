export function createGarminPersonalClient(db:any,key:string,project:string,options?:{fetcher?:typeof fetch;now?:()=>number}):Promise<{ready:()=>Promise<void>;getToken:()=>Promise<string>;fetch:typeof fetch}>
export function retrySeconds(header:string|null,now?:number):number
export function parsePersonalToken(body:string,now?:number):{token:string;expiresAt:string}
export class GarminPersonalDeferred extends Error {status:number;constructor(status:number)}

import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
export type ChatMode='local'|'personal'|'research'
export type CoachCitation={title:string;url:string}
export type CoachChatMessage={role:'user'|'assistant';content:string}
export type CoachRemoteAnswer={text:string;citations:CoachCitation[];searched:boolean}
async function request(body?:unknown,signal?:AbortSignal){
 if(!garminSupabase)throw Error('Coach-Verbindung fehlt.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte erneut anmelden.')
 const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-chat',{method:body?'POST':'GET',cache:'no-store',signal,
 headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const result=await res.json().catch(()=>null)
 if(!res.ok)throw Error(typeof result?.error==='string'?result.error:'KI-Verbindung momentan nicht verfügbar.')
 return result
}
export async function coachChatStatus(signal?:AbortSignal):Promise<boolean>{return (await request(undefined,signal))?.configured===true}
export async function requestCoachChat(mode:'personal'|'research',messages:CoachChatMessage[],context:string,signal:AbortSignal):Promise<CoachRemoteAnswer>{
 const data=await request({mode,messages:messages.slice(-9),context:mode==='personal'?context:'',consent:true},signal)
 if(typeof data?.text!=='string'||!data.text.trim())throw Error('Keine Antwort erhalten.')
 return {text:data.text,citations:Array.isArray(data.citations)?data.citations.filter((x:CoachCitation)=>typeof x?.title==='string'&&typeof x.url==='string'&&/^https:\/\//i.test(x.url)):[],searched:data.searched===true}
}

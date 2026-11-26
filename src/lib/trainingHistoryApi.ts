import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
import type {HistoryRevision,PlanSnapshot} from './trainingHistory.mjs'
type MonthData={month:string;today:string;activities:unknown[];manual:unknown[];revisions:HistoryRevision[]}
async function request(path:string,init:RequestInit={}){
 if(!garminSupabase)throw Error('Garmin-Anmeldung fehlt.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden.')
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-training-history'+path,{...init,cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,'content-type':'application/json'}})
 if(!response.ok)throw Error('Trainingshistorie derzeit nicht verfügbar ('+response.status+').')
 return await response.json()
}
export async function readTrainingMonth(month:string,signal?:AbortSignal):Promise<MonthData>{
 const d=await request('?month='+encodeURIComponent(month),{signal})
 if(d.month!==month||typeof d.today!=='string'||!Array.isArray(d.activities)||!Array.isArray(d.manual)||!Array.isArray(d.revisions))throw Error('Unvollständige Trainingshistorie.')
 return d
}
export async function saveTrainingWeek(snapshot:PlanSnapshot,requestId:string):Promise<HistoryRevision>{
 const d=await request('',{method:'POST',body:JSON.stringify({snapshot,requestId})})
 if(d.revision?.week_start!==snapshot.weekStart||!d.revision?.id)throw Error('Keine Speicherbestätigung erhalten.')
 return d.revision
}

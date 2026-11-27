import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
import {DEFAULT_RHYTHM,RHYTHM_KEY,normalizeRhythm} from './trainingRhythm.mjs'
import type {TrainingRhythm} from './trainingRhythm.mjs'
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

function checkedRhythm(value:unknown):TrainingRhythm{
 const rhythm=normalizeRhythm(value)
 if(!rhythm)throw Error('Trainingsrhythmus nicht bestätigt.')
 return rhythm
}
export async function loadTrainingRhythm(signal?:AbortSignal):Promise<TrainingRhythm>{
 const result=await request('?rhythm=1',{signal})
 if(result.rhythm!==null)return checkedRhythm(result.rhythm)
 // First authenticated device with legacy preferences can migrate them. The
 // server uses insert-if-absent, so another device cannot overwrite a profile.
 let legacy:TrainingRhythm|null=null
 try{legacy=normalizeRhythm(JSON.parse(localStorage.getItem(RHYTHM_KEY)||'null'))}catch{}
 if(!legacy)return import.meta.env.VITE_GARMIN_INSTANCE==='secondary'?{rowing:{days:[],minutes:30},strength:{days:[],minutes:30}}:DEFAULT_RHYTHM
 const saved=await request('?rhythm=1',{method:'POST',signal,body:JSON.stringify({action:'migrate',rhythm:legacy})})
 const rhythm=checkedRhythm(saved.rhythm)
 try{localStorage.removeItem(RHYTHM_KEY)}catch{}
 return rhythm
}
export async function saveTrainingRhythm(rhythm:TrainingRhythm):Promise<TrainingRhythm>{
 const result=await request('?rhythm=1',{method:'POST',body:JSON.stringify({action:'save',rhythm})})
 const saved=checkedRhythm(result.rhythm)
 try{localStorage.removeItem(RHYTHM_KEY)}catch{}
 return saved
}

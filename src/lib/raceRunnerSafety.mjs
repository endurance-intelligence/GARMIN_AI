import {validFuelMarks} from './raceFuelLog.mjs'
/** Race-day storage contracts. Only explicit user taps advance rounds.
 * Local browser data is not a remote backup; never unlocks authenticated pages.
 */
const validCount=(value,total)=>Number.isInteger(total)&&total>=1&&total<=500&&
 Number.isInteger(value)&&value>=0&&value<=total
const validStamp=value=>value===null||value===undefined||
 (Number.isInteger(value)&&value>=0&&value<10**16)
export const RUNNER_TAP_GUARD_MS=12000
export function validateRunnerSnapshot(snapshot,{raceDate,raceName,total}={}){
 const empty={ok:true,reason:null,marks:{},fuelMarks:{},completed:0,lastTapAt:null,startTime:null}
 if(snapshot===null||snapshot===undefined)return empty
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
  snapshot.version!==1||snapshot.raceDate!==raceDate||
  snapshot.raceName!==raceName)
  return {ok:false,reason:'Der gespeicherte Rennstand gehört nicht zu diesem Event oder ist beschädigt.'}
 const completed=snapshot.runnerCompleted??0
 if(!validCount(completed,total)||!validStamp(snapshot.runnerTapAt)||
  !snapshot.marks||typeof snapshot.marks!=='object'||Array.isArray(snapshot.marks))
  return {ok:false,reason:'Der gespeicherte Rundenzähler ist ungültig. Bitte nicht überschreiben, sondern kontrollieren.'}
 const fuelMarks=validFuelMarks(snapshot.fuelMarks??{},{completed,total})
 if(!fuelMarks)return {ok:false,reason:'Gespeicherte Verpflegungseinträge ungültig. Rennlog bleibt unverändert.'}
 return {ok:true,reason:null,marks:snapshot.marks,fuelMarks,completed,
  lastTapAt:snapshot.runnerTapAt??null,
  startTime:typeof snapshot.startTime==='string'?snapshot.startTime:null}
}
export function assessRunnerAdvance({completed,total,lastTapAt=null,now}={}){
 if(!validCount(completed,total)||!Number.isSafeInteger(now)||now<0)
  return {ok:false,reason:'Rundenzähler oder Gerätezeit ungültig.'}
 if(completed>=total)return {ok:false,reason:'Alle Runden sind bereits bestätigt.'}
 if(lastTapAt!==null&&lastTapAt!==undefined){
  if(!validStamp(lastTapAt))return {ok:false,reason:'Gespeicherter Klickzeitpunkt ungültig.'}
  if(now<lastTapAt)return {ok:false,reason:'Die Gerätezeit hat sich verändert. Bitte die Zeit prüfen.'}
  if(now-lastTapAt<RUNNER_TAP_GUARD_MS)
   return {ok:false,reason:'Runde gerade bestätigt. Ein versehentlicher zweiter Tipp wurde abgefangen.'}
 }
 return {ok:true,next:completed+1,stamp:now,reason:null}
}
export function assessRunnerCorrection({count,total,recorded}={}){
 if(!validCount(count,total)||!validCount(recorded,total))
  return {ok:false,reason:'Bitte eine gültige Rundenzahl auswählen.'}
 if(count<recorded)
  return {ok:false,reason:'Die Crew hat bereits mehr echte Zwischenzeiten gespeichert. Zuerst diese korrigieren.'}
 return {ok:true,count,reason:null}
}

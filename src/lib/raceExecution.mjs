/** User-entered race execution plan, never a performance prediction. */
import {estimateRaceStrategy} from './raceStrategyMath.mjs'
const valid=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max
const round1=n=>Math.round(n*10)/10
const minutesText=n=>Math.floor(n/60)+'h '+String(Math.round(n)%60).padStart(2,'0')+'m'
export function buildRaceExecution(input){
 const {distanceKm,courseMode,loopKm,movingMinutes,regularPauseMinutes,
  longStopEvery,longStopMinutes,paceSeconds,targetHours,
  carbsGPerHour,fluidMlPerHour,sodiumMgPerHour}=input||{}
 const base=estimateRaceStrategy({distanceKm,courseMode,loopKm,movingMinutes,
  regularPauseMinutes,longStopEvery,longStopMinutes,paceSeconds})
 if(!base)return {status:'missing',checkpoints:[],estimate:null,nutrition:null,
  target:null,warning:'Bitte zuerst Strecke und geplante Laufzeiten eingeben.'}
 const target=valid(targetHours,0.1,240)?(()=>{
  const min=targetHours*60
  const remaining=Math.round(min-base.totalMinutes)
  return {minutes:Math.round(min),remaining,
   status:remaining>=0?'within':'over',
   text:remaining>=0?remaining+' Min. Puffer gegenüber deinem Zeitlimit':
    Math.abs(remaining)+' Min. über deinem Zeitlimit – Zeitplan prüfen'}
 })():null
 let elapsed=0
 const checkpoints=[]
 if(courseMode==='laps'&&valid(loopKm,0.01,100)&&valid(movingMinutes,10,360)){
  for(let k=1;k<=Math.ceil(distanceKm/loopKm);k++){
   const kmBefore=(k-1)*loopKm,legDistance=Math.min(loopKm,distanceKm-kmBefore)
   const fullLeg=round1(legDistance/loopKm*movingMinutes)
   elapsed+=fullLeg
   const isFinish=k*loopKm>=distanceKm-0.000001
   const regular=!isFinish&&valid(regularPauseMinutes,0,120)?regularPauseMinutes:0
   const longBreak=!isFinish&&Number.isInteger(longStopEvery)&&longStopEvery>=2&&
    longStopEvery<=50&&k%longStopEvery===0&&valid(longStopMinutes,0,120)?
    longStopMinutes:0
   const arrivalMin=Math.round(elapsed)
   elapsed+=regular+longBreak
   checkpoints.push({index:k,distanceKm:round1(Math.min(k*loopKm,distanceKm)),
    legDistanceKm:round1(legDistance),moveMinutes:round1(fullLeg),
    arrivalMinutes:arrivalMin,arrivalText:minutesText(arrivalMin),
    pauseMinutes:regular+longBreak,longBreakMinutes:longBreak,
    departureMinutes:Math.round(elapsed),
    departureText:minutesText(elapsed),finish:isFinish})
  }
 }else{
  // No invented aid stations or split points for unknown point-to-point courses.
  checkpoints.push({index:1,distanceKm:round1(distanceKm),legDistanceKm:round1(distanceKm),
   moveMinutes:base.movingMinutes,arrivalMinutes:base.totalMinutes,
   arrivalText:minutesText(base.totalMinutes),pauseMinutes:0,longBreakMinutes:0,
   departureMinutes:base.totalMinutes,departureText:minutesText(base.totalMinutes),finish:true})
 }
 const hrs=base.totalMinutes/60
 const nutrition=(()=>{
  const carbs=valid(carbsGPerHour,0,150)?Math.round(carbsGPerHour*hrs):null
  const fluid=valid(fluidMlPerHour,0,1500)?Math.round(fluidMlPerHour*hrs):null
  const sodium=valid(sodiumMgPerHour,0,3000)?Math.round(sodiumMgPerHour*hrs):null
  if(carbs===null&&fluid===null&&sodium===null)return null
  return {carbsG:carbs,fluidMl:fluid,sodiumMg:sodium,hours:round1(hrs)}
 })()
 const warning=courseMode==='laps'&&checkpoints.length>0&&checkpoints.at(-1).legDistanceKm<loopKm?
  'Letzte Runde ist kürzer; Laufzeit entsprechend anteilig gerechnet.':null
 return {status:'ready',checkpoints,estimate:base,target,nutrition,warning}
}

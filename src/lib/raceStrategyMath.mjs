/** Plain arithmetic for athlete-entered race strategy; not a training prediction. */
export function estimateRaceStrategy({distanceKm,courseMode,loopKm,movingMinutes,
 regularPauseMinutes,longStopEvery,longStopMinutes,paceSeconds}){
 if(!(Number.isFinite(distanceKm)&&distanceKm>0&&distanceKm<=500))
  return null
 let moving=0,pauses=0,rounds=null,normalStops=null,extraStops=0
 if(courseMode==='laps'){
  if(!(Number.isFinite(loopKm)&&loopKm>0&&loopKm<=100&&
   Number.isFinite(movingMinutes)&&movingMinutes>=10&&movingMinutes<=360))
   return null
  rounds=Math.ceil(distanceKm/loopKm)
  normalStops=Math.max(0,rounds-1)
  moving=distanceKm/loopKm*movingMinutes
  pauses=normalStops*(Number.isFinite(regularPauseMinutes)?regularPauseMinutes:0)
  if(Number.isInteger(longStopEvery)&&longStopEvery>=2&&
   Number.isFinite(longStopMinutes)&&longStopMinutes>=0){
    extraStops=Math.floor(normalStops/longStopEvery)
    pauses+=extraStops*longStopMinutes
  }
 }else{
  if(!(Number.isFinite(paceSeconds)&&paceSeconds>=180&&paceSeconds<=1200))
   return null
  moving=distanceKm*paceSeconds/60
 }
 const totalMinutes=Math.round(moving+pauses)
 return {movingMinutes:Math.round(moving),breakMinutes:Math.round(pauses),
  totalMinutes,rounds,normalStops,extraStops,
  formattedTotal:Math.floor(totalMinutes/60)+'h '+String(totalMinutes%60).padStart(2,'0')+'m'}
}

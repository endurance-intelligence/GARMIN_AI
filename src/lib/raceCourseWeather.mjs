import {haversine} from './gpxRaceRoute.mjs'
/** Only actual GPX points are used: no invented middle city or terrain shelter. */
export function checkpointsFromTrack(points){
 if(!Array.isArray(points)||points.length<2)return []
 const cumulative=[0]
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i]
  if(!Array.isArray(a)||!Array.isArray(b)||!Number.isFinite(a[0])||!Number.isFinite(b[0]))
   return []
  cumulative.push(cumulative[i-1]+haversine(a,b))
 }
 const total=cumulative[cumulative.length-1]
 if(!Number.isFinite(total)||total<100)return []
 return [0,0.25,0.5,0.75,1].map(fraction=>{
  const target=fraction*total
  let i=1
  while(i<cumulative.length-1&&cumulative[i]<target)i++
  const previous=cumulative[i-1],next=cumulative[i],ratio=next===previous?0:(target-previous)/(next-previous)
  const a=points[i-1],b=points[i]
  const latitude=a[0]+(b[0]-a[0])*ratio,longitude=a[1]+(b[1]-a[1])*ratio
  return {fraction,km:Math.round(target/100)/10,
   latitude,longitude,label:fraction===0?'Start':fraction===1?'Ziel':
    fraction===0.5?'Streckenmitte':'km '+(target/1000).toFixed(1)}
 })
}
export function stageWeatherAt(forecast,startEpoch,fraction,targetHours){
 if(!forecast||!Array.isArray(forecast.hours)||!Number.isFinite(startEpoch)||
  !Number.isFinite(targetHours)||targetHours<=0)return null
 const epoch=startEpoch+Math.round(targetHours*fraction)*3600
 const row=forecast.hours.find(x=>x.epoch===epoch)
 return row||null
}

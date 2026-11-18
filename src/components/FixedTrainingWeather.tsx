/** Readable forecast at an EXISTING fixed start time and location.
 * Never recommends moving an ORC or football session to a "better slot".
 * Weather is only presented when the forecast actually covers that hour.
 */
import {useEffect,useState} from 'react'
import {getWeather,hourAt,weatherLabel} from '../lib/weatherIntelligence'
import type {WeatherHour,WeatherPlace} from '../lib/weatherIntelligence'
import '../styles/fixed-training-weather.css'
export function FixedTrainingWeather({active,date,time,location,latitude,longitude,compact=false}:{
 active:boolean;date:string;time:string;location:string;latitude:number;longitude:number;compact?:boolean
}){
 const [hour,setHour]=useState<WeatherHour|null>(null)
 const [unavailable,setUnavailable]=useState(false)
 useEffect(()=>{
  if(!active||!date||!time||!Number.isFinite(latitude)||!Number.isFinite(longitude))return
  let mounted=true
  setHour(null);setUnavailable(false)
  const place:WeatherPlace={name:location,latitude,longitude,country:'Deutschland'}
  void getWeather(place).then(report=>{
   if(!mounted)return
   const forecastHour=hourAt(report,date,Number(time.slice(0,2)))
   setHour(forecastHour)
   setUnavailable(!forecastHour)
  }).catch(()=>{if(mounted)setUnavailable(true)})
  return ()=>{mounted=false}
 },[active,date,time,latitude,longitude,location])
 if(!active)return null
 if(!hour)return unavailable?
  <small className="ftw-unavailable">Wetter {time.slice(0,5)}: noch keine Prognose</small>:null
 const risk=hour.code>=95||hour.gust>=55||hour.precipitation>=3
 return <span className={'ftw-line'+(compact?' ftw-compact':'')+(risk?' ftw-risk':'')}
  title={'Wetter zur Startzeit um '+time.slice(0,5)+' Uhr in '+location}>
  <span aria-hidden="true">{hour.code>=95?'⛈':hour.code>=51?'🌧':hour.code>=3?'☁':hour.isDay?'☀':'🌙'}</span>
  <span>{time.slice(0,5)} Uhr · {weatherLabel(hour.code)} · {Math.round(hour.temperature)}°C
   {!compact&&' · Regen '+Math.round(hour.rainProbability)+' %'}
   {!compact&&' · Böen '+Math.round(hour.gust)+' km/h'}</span>
  {risk&&<strong>Wetter beachten</strong>}
 </span>
}

/** Compact race-specific forecast, shown with the active race objective on Coach home. */
import {useEffect,useState} from 'react'
import {findPlaces,getWeather,localToday} from '../lib/weatherIntelligence'
import {raceForecastStatus} from '../lib/raceForecastShare.mjs'
import '../styles/coach-goal.css'
type GoalWeather={race_date:string;race_location:string;race_start_time:string|null;target_hours:number|null}
type View={temperature:string;feels:string;rain:number;precipitation:number;gust:number;description:string;label:string}
export function CoachRaceWeatherMini({active,goal,onOpenDetails}:{active:boolean;goal:GoalWeather;onOpenDetails?:()=>void}){
 const [view,setView]=useState<View|null>(null)
 const [loading,setLoading]=useState(false)
 const [missing,setMissing]=useState('')
 useEffect(()=>{
  if(!active||!goal.race_location||!goal.race_date)return
  let mounted=true
  setView(null);setMissing('');setLoading(true)
  void (async()=>{
   const location=goal.race_location.trim()
   const choices=await findPlaces(location)
   const found=choices.find(x=>x.name.toLocaleLowerCase('de-DE')===location.toLocaleLowerCase('de-DE'))||choices[0]
   if(!found){if(mounted)setMissing('Wetterort nicht gefunden');return}
   const report=await getWeather(found)
   const day=localToday(report.timezone)
   const days=Math.round((Date.parse(goal.race_date+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000)
   if(days<0){if(mounted)setMissing('Wettkampf liegt zurück');return}
   if(!goal.race_start_time||!goal.target_hours){if(mounted)setMissing('Start- oder Zielzeit fehlt für die Stundenprognose');return}
   const start=Number(goal.race_start_time.slice(0,2)),duration=Math.ceil(Number(goal.target_hours))
   if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<1||duration>48)return
   const index=report.hours.findIndex(h=>h.date===goal.race_date&&h.hour===start)
   const hours=index>=0?report.hours.slice(index,index+duration):[]
   const complete=hours.length===duration&&hours.every((h,i)=>h.epoch===hours[0].epoch+i*3600)
   if(!complete){if(mounted)setMissing('Noch keine vollständige Stundenprognose für den Renntag');return}
   const temp=hours.map(x=>x.temperature),feel=hours.map(x=>x.feelsLike),
    rain=Math.max(...hours.map(x=>x.rainProbability)),
    precipitation=Math.max(...hours.map(x=>x.precipitation)),
    gust=Math.max(...hours.map(x=>x.gust))
   const state=raceForecastStatus(goal.race_date,day,true)
   if(mounted)setView({temperature:Math.round(Math.min(...temp))+'–'+Math.round(Math.max(...temp))+'°C',
    feels:Math.round(Math.min(...feel))+'–'+Math.round(Math.max(...feel))+'°C',
    rain:Math.round(rain),precipitation:Math.round(precipitation*10)/10,
    gust:Math.round(gust),label:state.label,description:state.description})
  })().catch(()=>{if(mounted)setMissing('Rennwetter momentan nicht abrufbar')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active,goal.race_date,goal.race_location,goal.race_start_time,goal.target_hours])
 if(!active)return null
 return <button type="button" className="cg-home-weather" onClick={onOpenDetails}
  disabled={!onOpenDetails}
  aria-label={'Detaillierte Rennwetterprognose für '+(goal.race_location||'deinen Wettkampf')+' öffnen'}>
  <span className="cg-home-weather-icon" aria-hidden="true">☁</span>
  <div className="cg-home-weather-content">
   <span className="cg-home-weather-kicker">RENNWETTER · {goal.race_location||'Ort fehlt'}</span>
   {view?<><div className="cg-home-weather-data"><strong>{view.temperature}</strong>
    <span>Gefühlt {view.feels}</span><span>Regen bis {view.rain} %</span>
    <span>Regenstärke max. {view.precipitation.toLocaleString('de-DE')} mm/h</span>
    <span>Böen bis {view.gust} km/h</span></div>
    <small title={view.description}>{view.label} · Prognose, keine Gewissheit</small></>:
    <small>{loading?'Prüfe Renntag-Prognose …':missing||'Noch keine Stundenprognose vorhanden'}</small>}
  </div>
  <span className="cg-home-weather-open" aria-hidden="true">↗</span>
 </button>
}

/** Coach home: existing fixed evening/morning session wins over weather slot search.
 * Free days can still show optional best-weather-slot advice.
 */
import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {FixedTrainingWeather} from './FixedTrainingWeather'
import {WeatherPanel} from './WeatherPanel'
type Slot={weekday:number;code:string;title:string;start_time:string;location_label:string;location_lat:number;location_lon:number}
export function CoachTodayWeather({active}:{active:boolean}){
 const [slots,setSlots]=useState<Slot[]>([])
 const [loaded,setLoaded]=useState(false)
 const today=berlinDateToday()
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  void garminSupabase.auth.getSession().then(async({data})=>{
   if(!data.session)return
   const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-weekly-options',{
    cache:'no-store',headers:{authorization:'Bearer '+data.session.access_token,
     apikey:garminPublishableKey}})
   if(!res.ok)throw Error('No weekly slots')
   const json=await res.json() as {options?:Slot[]}
   if(mounted){setSlots(Array.isArray(json.options)?json.options:[]);setLoaded(true)}
  }).catch(()=>{if(mounted)setLoaded(true)})
  return ()=>{mounted=false}
 },[active])
 const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7
 const today's=slots.filter(x=>x.weekday===weekday)
 if(!active)return null
 if(!loaded)return <p className="co-data-note">Lade Trainingswetter …</p>
 if(!today's.length)return <WeatherPanel active={active} mode="training" compact/>
 return <div className="co-fixed-weather">
  {today's.map(slot=><div key={slot.code} className="co-fixed-slot">
   <strong>{slot.title} · {slot.start_time.slice(0,5)} Uhr · {slot.location_label}</strong>
   <FixedTrainingWeather active={active} date={today} time={slot.start_time}
    location={slot.location_label} latitude={slot.location_lat}
    longitude={slot.location_lon}/>
  </div>)}
  <small>Wetter zur festen Startzeit, kein alternatives Trainingsfenster.</small>
 </div>
}

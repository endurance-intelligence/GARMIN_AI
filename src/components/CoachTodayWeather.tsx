/** Coach home: existing fixed evening/morning session wins over weather slot search.
 * Free days can still show optional best-weather-slot advice.
 */
import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {FixedTrainingWeather} from './FixedTrainingWeather'
import {WeatherPanel} from './WeatherPanel'
type Slot={weekday:number;code:string;title:string;start_time:string;location_label:string;location_lat:number;location_lon:number}
type Choice={training_date:string;option_code:string;choice:'selected'|'skipped'|'open'}
export function CoachTodayWeather({active}:{active:boolean}){
 const [slots,setSlots]=useState<Slot[]>([])
 const [choices,setChoices]=useState<Choice[]>([])
 const [loaded,setLoaded]=useState(false)
 const [reload,setReload]=useState(0)
 useEffect(()=>{
  const changed=()=>setReload(n=>n+1)
  window.addEventListener('garmin-ai-weekly-choice-changed',changed)
  return ()=>window.removeEventListener('garmin-ai-weekly-choice-changed',changed)
 },[])
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
   const json=await res.json() as {options?:Slot[];choices?:Choice[]}
   if(mounted){setSlots(Array.isArray(json.options)?json.options:[]);setChoices(Array.isArray(json.choices)?json.choices:[]);setLoaded(true)}
  }).catch(()=>{if(mounted)setLoaded(true)})
  return ()=>{mounted=false}
 },[active,reload])
 const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7
 const todaySlots=slots.filter(x=>x.weekday===weekday)
 const stateFor=(slot:Slot)=>choices.find(c=>c.training_date===today&&c.option_code===slot.code)?.choice||'open'
 const selected=todaySlots.filter(x=>stateFor(x)==='selected')
 const open=todaySlots.filter(x=>stateFor(x)==='open')
 const skipped=todaySlots.length>0&&!selected.length&&!open.length
 const visible=selected.length?selected:open
 if(!active)return null
 if(!loaded)return <p className="co-data-note">Lade Trainingswetter …</p>
 if(skipped)return null // "Auslassen" is not a fixed appointment or a weather window.
 if(!todaySlots.length)return <WeatherPanel active={active} mode="training" compact/>
 return <div className="co-fixed-weather">
  {visible.map(slot=><div key={slot.code} className="co-fixed-slot">
   <strong>{slot.title} · {slot.start_time.slice(0,5)} Uhr · {slot.location_label}</strong>
   <FixedTrainingWeather active={active} date={today} time={slot.start_time}
    location={slot.location_label} latitude={slot.location_lat}
    longitude={slot.location_lon}/>
  </div>)}
  <small>{selected.length?'Wetter zur zugesagten Startzeit.':'Wetter für einen optionalen Termin – du hast noch nicht zugesagt.'}</small>
 </div>
}

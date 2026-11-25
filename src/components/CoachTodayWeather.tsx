import {useEffect,useMemo,useState} from 'react'
import {getWeather,weatherLabel} from '../lib/weatherIntelligence'
import type {WeatherHour} from '../lib/weatherIntelligence'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import {WeatherPanel} from './WeatherPanel'
import {Icon} from './Icon'
type Report={date:string;text:string}
type Slot={code:string;title:string;location_label:string;location_lat:number;location_lon:number;start_time:string;duration_minutes?:number}
const clock=(m:number)=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0')
export function CoachTodayWeather({active,snapshot,plan,onReport}:{active:boolean;snapshot:CoachSnapshot;plan:SevenDayPlan;onReport:(r:Report|null)=>void}){
 const day=plan.days.find(d=>d.date===plan.today)
 const group=day?.selectedGroup
 const fixed=useMemo(()=>group?(snapshot.options.options as Slot[]|undefined)?.find(o=>o.code===group.code)||null:null,[group,snapshot.options])
 const [hours,setHours]=useState<WeatherHour[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const [loadedKey,setLoadedKey]=useState('')
 const time=group?.startTime||''
 const valid=!!fixed&&Number.isFinite(fixed.location_lat)&&Number.isFinite(fixed.location_lon)&&Math.abs(fixed.location_lat)<=90&&Math.abs(fixed.location_lon)<=180&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)
 const estimated=!(typeof fixed?.duration_minutes==='number'&&Number.isFinite(fixed.duration_minutes)&&fixed.duration_minutes>0)
 const minutes=estimated?60:Math.min(180,Math.round(fixed!.duration_minutes!))
 const start=valid?Number(time.slice(0,2))*60+Number(time.slice(3,5)):0
 const end=clock(start+minutes)
 const signature=JSON.stringify([plan.today,group?.code,time,fixed?.location_lat,fixed?.location_lon,minutes])
 const visible=loadedKey===signature?hours:[]
 useEffect(()=>{
  onReport(null);setHours([]);setLoadedKey('');setError('')
  if(!active||!group||!fixed||!valid){setLoading(false);return}
  let live=true;setLoading(true)
  void getWeather({name:fixed.location_label,latitude:fixed.location_lat,longitude:fixed.location_lon}).then(f=>{
   if(!live)return
   const idx=f.hours.findIndex(h=>h.date===plan.today&&h.hour===Math.floor(start/60))
   const count=Math.ceil((start%60+minutes)/60)
   const rows=idx<0?[]:f.hours.slice(idx,idx+count)
   if(rows.length!==count||rows.some((h,i)=>h.epoch!==rows[0].epoch+3600*i)){setError('Keine vollständige Prognose für den Termin.');return}
   setHours(rows);setLoadedKey(signature)
   const range=(k:'temperature'|'feelsLike')=>{const a=Math.round(Math.min(...rows.map(h=>h[k]))),b=Math.round(Math.max(...rows.map(h=>h[k])));return a===b?String(a):a+' bis '+b}
   const text=group.title+' · '+fixed.location_label+' · '+time+'–'+end+' Uhr'+(estimated?' (60 Min. geschätzt)':'')+'. '+weatherLabel(rows[0].code)+', '+range('temperature')+' °C, gefühlt '+range('feelsLike')+' °C, Regenrisiko bis '+Math.round(Math.max(...rows.map(h=>h.rainProbability)))+' %, Böen bis '+Math.round(Math.max(...rows.map(h=>h.gust)))+' km/h.'
   onReport({date:plan.today,text})
  }).catch(()=>{if(live)setError('Wetter derzeit nicht abrufbar.')}).finally(()=>{if(live)setLoading(false)})
  return ()=>{live=false}
 },[active,signature,onReport])
 if(!active)return null
 if(group)return <section className="ctw-root" aria-label="Wetter zum bestätigten Training">
  <div className="ctw-head"><div><small>TRAININGSWETTER · FESTER TERMIN</small><strong>{time||'Startzeit offen'} Uhr · {fixed?.location_label||group.location||'Ort fehlt'}</strong></div><Icon name="wind"/></div>
  {!valid?<p>Startzeit oder genaue Koordinaten fehlen. Kein Wetterort wird geraten.</p>:loading?<p role="status">Stundenprognose wird geladen …</p>:error?<p role="alert">{error}</p>:visible.length>0&&<><div className="ctw-metrics">
   <div><small>TEMPERATUR</small><strong>{Math.round(visible[0].temperature)}°</strong></div><div><small>GEFÜHLT</small><strong>{Math.round(visible[0].feelsLike)}°</strong></div><div><small>REGENRISIKO MAX.</small><strong>{Math.round(Math.max(...visible.map(h=>h.rainProbability)))}%</strong></div><div><small>BÖEN MAX.</small><strong>{Math.round(Math.max(...visible.map(h=>h.gust)))}<em> km/h</em></strong></div>
  </div><p>{time}–{end} Uhr · {weatherLabel(visible[0].code)}{estimated?' · Dauer geschätzt (60 Min.)':''} · Open-Meteo</p></>}
 </section>
 if(!day||['illness','blocked','completed','recovery','race','mobility','declined','acknowledged'].includes(day.kind)||day.decision==='declined')return null
 const planned=snapshot.plans.entries.filter(p=>p.training_date===plan.today&&p.state!=='cancelled'&&p.state!=='draft')
 const archive=planned.length===1?planned[0].archive_snapshot as {startTime?:string}|null:null
 const fixedTime=archive?.startTime||null
 return <WeatherPanel active={active} mode="training" date={plan.today} fixedTime={fixedTime} durationHint={day.minutes} onTrainingReport={onReport} compact/>
}

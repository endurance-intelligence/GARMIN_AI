import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {findPlaces,getWeather,raceSegments,weatherLabel} from '../lib/weatherIntelligence'
import type {Forecast,WeatherHour} from '../lib/weatherIntelligence'
import {explainRaceGust} from '../lib/raceWindExplain.mjs'
import {checkpointsFromTrack,stageWeatherAt} from '../lib/raceCourseWeather.mjs'
import type {Point} from '../lib/gpxRaceRoute.mjs'
import {Icon} from './Icon'
import '../styles/race-forecast-compact.css'
type Race={race_name:string;race_date:string;race_start_time:string|null;race_location:string;target_hours:number|null}
async function raceGoal(){
 if(!garminSupabase)throw Error('Bitte anmelden')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden')
 const r=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-goal',{
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey},cache:'no-store'})
 if(!r.ok)throw Error('Wettkampfziel nicht erreichbar')
 const data=await r.json() as {goal:Race|null}
 return data.goal
}
const minmax=(values:number[])=>values.length?
 [Math.round(Math.min(...values)),Math.round(Math.max(...values))]:null
const summary=(hours:WeatherHour[])=>{
 const temp=minmax(hours.map(x=>x.temperature))
 const rain=Math.max(...hours.map(x=>x.rainProbability))
 const gust=Math.max(...hours.map(x=>x.gust))
 const changes=[]
 if(rain>=45||hours.some(x=>x.precipitation>=0.4))changes.push('Regen möglich')
 if(gust>=35)changes.push('Windböen beachten')
 if(temp&&temp[0]<=3)changes.push('Kältephasen')
 if(temp&&temp[1]>=25)changes.push('Wärmebelastung möglich')
 if(hours.some(x=>!x.isDay))changes.push('Dunkelheit')
 return {temp,rain,gust,changes}
}
type CourseInfo={courseType:string|null;finishCity:string|null}
type RaceStage={label:string;fraction:number;km?:number;where:string;weather:WeatherHour}
export function RaceForecastCompact({active,refreshKey=0,onForecast,eventCity,course,routePoints}:{
 active:boolean;refreshKey?:number;onForecast?:(report:Forecast|null)=>void;eventCity?:string|null;
 course?:CourseInfo|null;routePoints?:Point[]|null
}){
 const [race,setRace]=useState<Race|null>(null)
 const [report,setReport]=useState<Forecast|null>(null)
 const [placeName,setPlaceName]=useState('')
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [stages,setStages]=useState<RaceStage[]>([])
 const [stageLoading,setStageLoading]=useState(false)
 const [stageError,setStageError]=useState('')
 useEffect(()=>{
  if(!active)return
  let cancelled=false
  setLoading(true);setReport(null);setError('');onForecast?.(null)
  void (async()=>{
   try{
    const goal=await raceGoal()
    if(cancelled)return
    setRace(goal)
    const location=(eventCity||goal?.race_location||'').trim()
    if(!location)return
    const choices=await findPlaces(location)
    const exact=choices.find(x=>x.name.toLocaleLowerCase('de-DE')===location.toLocaleLowerCase('de-DE'))||choices[0]
    if(!exact)throw Error('Wetterort nicht gefunden.')
    const data=await getWeather(exact)
    if(cancelled)return
    setReport(data);setPlaceName(exact.name);onForecast?.(data)
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Wetterdaten nicht verfügbar')}
   finally{if(!cancelled)setLoading(false)}
  })()
  return ()=>{cancelled=true}
 },[active,refreshKey,eventCity])
 useEffect(()=>{
  if(!active||course?.courseType!=='point_to_point'||!report||!race)return
  let cancelled=false
  setStageLoading(true);setStages([]);setStageError('')
  void (async()=>{
   try{
    if(!race.race_start_time||!race.target_hours)throw Error('Startzeit und Zielzeit fehlen.')
    const startHour=Number(race.race_start_time.slice(0,2))
    const startRow=report.hours.find(x=>x.date===race.race_date&&x.hour===startHour)
    if(!startRow)throw Error('Noch keine Stundenprognose für den Renntag.')
    const samples=routePoints&&routePoints.length>=3?checkpointsFromTrack(routePoints):[]
    let results:RaceStage[]=[]
    if(samples.length===5){
     const fetched=await Promise.allSettled(samples.map(async p=>{
      const place={name:p.label,latitude:p.latitude,longitude:p.longitude}
      const forecast=await getWeather(place)
      const hour=stageWeatherAt(forecast,startRow.epoch,p.fraction,race.target_hours!)
      return hour?{label:p.label,fraction:p.fraction,km:p.km,where:'GPX-Streckenpunkt',weather:hour}:null
     }))
     const ready=fetched.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[])
     if(ready.length!==5)throw Error('Für mindestens einen GPX-Streckenpunkt fehlen Wetterstunden.')
     results=ready
    }else{
     const finishCity=course.finishCity?.trim()
     if(!finishCity)throw Error('Bitte die Zielstadt in den Veranstaltungsdaten ergänzen.')
     const choices=await findPlaces(finishCity)
     const end=choices.find(x=>x.name.toLocaleLowerCase('de-DE')===finishCity.toLocaleLowerCase('de-DE'))||choices[0]
     if(!end)throw Error('Zielstadt für die Wetterprognose nicht gefunden.')
     const finishForecast=await getWeather(end)
     const finishHour=stageWeatherAt(finishForecast,startRow.epoch,1,race.target_hours)
     if(!finishHour)throw Error('Noch keine Wetterprognose zum erwarteten Zieleinlauf.')
     results=[
      {label:'Start',fraction:0,where:report.place.name,weather:startRow},
      {label:'Ziel',fraction:1,where:end.name,weather:finishHour}
     ]
    }
    if(!cancelled)setStages(results)
   }catch(e){
    if(!cancelled)setStageError(e instanceof Error?e.message:'Streckenwetter nicht verfügbar.')
   }finally{if(!cancelled)setStageLoading(false)}
  })()
  return ()=>{cancelled=true}
 },[active,refreshKey,report,race,course?.courseType,course?.finishCity,routePoints])
 if(!active)return null
 const start=race?.race_start_time?Number(race.race_start_time.slice(0,2)):null
 const duration=race?.target_hours?Math.max(1,Math.ceil(race.target_hours)):null
 const full=report&&race&&start!==null&&duration!==null?
  raceSegments(report,race.race_date,start,duration):null
 // raceSegments returns every three hours, so compute overall min/max from the full
 // continuous time window rather than from the sparse rendered timeline.
 const startIdx=report?.hours.findIndex(x=>x.date===race?.race_date&&x.hour===start)??-1
 const hours=report&&startIdx>=0&&duration?report.hours.slice(startIdx,startIdx+duration):[]
 const complete=hours.length===duration&&
  hours.every((x,i)=>x.epoch===hours[0].epoch+i*3600)
 const pointToPoint=course?.courseType==='point_to_point'
 const stageComplete=pointToPoint&&stages.length>=2&&!stageLoading
 const info=stageComplete?summary(stages.map(s=>s.weather)):
  !pointToPoint&&complete?summary(hours):null
 const windAssessment=info?explainRaceGust(info.gust,info.temp?.[0]??null):null
 return <section className="rfc-root" aria-label="Wetter für dein aktuelles Hauptziel">
  <div className="rfc-head"><div><small>RACE INTELLIGENCE / RENNWETTER</small>
   <h2>Wetter am Renntag.</h2>
   <p>{race?race.race_date.split('-').reverse().join('.')+' · '+race.race_name:'Dein nächstes Hauptziel'} · {placeName||race?.race_location||'Ort offen'}</p>
  </div><span>START BIS ZIEL</span></div>
  {loading&&<p className="rfc-info">Prüfe die verfügbare Stundenprognose …</p>}
  {pointToPoint&&stageLoading&&<p className="rfc-info">Prüfe getrennte Wetterstandorte zur erwarteten Durchgangszeit …</p>}
  {pointToPoint&&stageError&&<p className="rfc-info">{stageError} Keine Stadtprognose als Gesamtstreckenwetter ausgegeben.</p>}
  {!loading&&!race&&<p className="rfc-info">Speichere zuerst ein Hauptziel.</p>}
  {!loading&&race&&!race.race_start_time&&<p className="rfc-info">Startzeit im Hauptziel ergänzen, damit wir das Wetter entlang deines Rennzeitraums prüfen.</p>}
  {!loading&&race&&!race.target_hours&&<p className="rfc-info">Zielzeit ergänzen, um den Wetterverlauf bis zum Ziel zu prüfen.</p>}
  {!loading&&!pointToPoint&&race&&start!==null&&duration!==null&&!complete&&
   <p className="rfc-info">Für den kompletten Zeitraum liegt noch keine belastbare Stundenprognose vor.
    Wir zeigen bewusst keine erfundenen Werte. Der Forecast wird näher am Renntag automatisch verfügbar.</p>}
  {info&&<div className="rfc-summary">
    <div className="rfc-metric"><Icon name="thermometer"/>
     <div><strong>{info.temp?.[0]}–{info.temp?.[1]}°C</strong>
      <small>{stageComplete?'Temperatur · Streckenpunkte':'Temperaturverlauf'}</small></div></div>
    <div className="rfc-metric"><Icon name="droplets"/>
     <div><strong>{info.rain} %</strong><small>{stageComplete?'Regen · Streckenpunkte':'Max. Regenwahrscheinlichkeit'}</small></div></div>
    <div className="rfc-metric"><Icon name="wind"/>
     <div><strong>{Math.round(info.gust)} km/h</strong><small>Max. Böen</small>
     {windAssessment&&<span className={'rfc-wind-label '+windAssessment.tone}>{windAssessment.label}</span>}</div></div>
   </div>}
  {windAssessment&&<p className="rfc-wind-explanation"><strong>Wind beim Laufen:</strong> {windAssessment.guidance}</p>}
  {info&&<p className="rfc-hints">{info.changes.length?info.changes.join(' · '):'Keine markanten Wetteränderungen in der aktuellen Prognose.'}</p>}
  {pointToPoint&&stageComplete&&<div className="rfc-course">
    <div className="rfc-course-title"><strong>{stages.length===5?'Wetter entlang deiner GPX-Strecke':'Start- und Zielwetter'}</strong>
     <small>{stages.length===5?'5 reale Streckenpunkte · Durchgangszeiten geschätzt':
      'Zwei Ortsprognosen · Zwischenstrecke ohne GPX nicht bewertet'}</small></div>
    <div className="rfc-course-points">{stages.map(stage=>
     <div key={stage.fraction} className="rfc-course-point">
      <span>{stage.label} · {stage.where}</span>
      <strong>{Math.round(stage.weather.temperature)}°C · {weatherLabel(stage.weather.code)}</strong>
      <small>{String(stage.weather.hour).padStart(2,'0')}:00 Uhr · Regen {Math.round(stage.weather.rainProbability)} % · Böen {Math.round(stage.weather.gust)} km/h</small>
     </div>)}
    </div>
   </div>}
  {info&&full&&!pointToPoint&&<details className="rfc-details">
    <summary>Wetterverlauf über {duration} Stunden ansehen</summary>
    <div className="rfc-timeline">
     {full.segments.map(h=><div key={h.epoch}><b>{String(h.hour).padStart(2,'0')}:00</b>
      <strong>{Math.round(h.temperature)}°C · {weatherLabel(h.code)}</strong>
      <span>Regen {Math.round(h.rainProbability)} % · Böen {Math.round(h.gust)} km/h</span>
     </div>)}
    </div>
   </details>}
  {error&&<p className="rfc-error" role="alert">{error}</p>}
  <p className="rfc-foot">{stageComplete?
   (stages.length===5?'Stichproben aus GPX-Koordinaten':'Ortsprognosen für Start und Ziel'):
   'Stadtprognose '+(placeName||'am Veranstaltungsort')} · Quelle Open-Meteo
   {report?' · Abruf '+new Date(report.fetchedAt).toLocaleString('de-DE',{hour:'2-digit',minute:'2-digit'}):''}.
   Geschätzter Rennfortschritt nach gleichmäßiger Geschwindigkeit. Keine Aussage über lokalen Windschutz oder Schatten.</p>
 </section>
}

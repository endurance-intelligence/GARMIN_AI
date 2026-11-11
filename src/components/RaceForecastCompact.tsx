import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {findPlaces,getWeather,raceSegments,weatherLabel} from '../lib/weatherIntelligence'
import type {Forecast,WeatherHour} from '../lib/weatherIntelligence'
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
export function RaceForecastCompact({active,refreshKey=0,onForecast}:{
 active:boolean;refreshKey?:number;onForecast?:(report:Forecast|null)=>void
}){
 const [race,setRace]=useState<Race|null>(null)
 const [report,setReport]=useState<Forecast|null>(null)
 const [placeName,setPlaceName]=useState('')
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!active)return
  let cancelled=false
  setLoading(true);setReport(null);setError('');onForecast?.(null)
  void (async()=>{
   try{
    const goal=await raceGoal()
    if(cancelled)return
    setRace(goal)
    if(!goal?.race_location)return
    const choices=await findPlaces(goal.race_location)
    const exact=choices.find(x=>x.name.toLocaleLowerCase('de-DE')===goal.race_location.toLocaleLowerCase('de-DE'))||choices[0]
    if(!exact)throw Error('Wetterort nicht gefunden.')
    const data=await getWeather(exact)
    if(cancelled)return
    setReport(data);setPlaceName(exact.name);onForecast?.(data)
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Wetterdaten nicht verfügbar')}
   finally{if(!cancelled)setLoading(false)}
  })()
  return ()=>{cancelled=true}
 },[active,refreshKey])
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
 const info=complete?summary(hours):null
 return <section className="rfc-root" aria-label="Wetter für dein aktuelles Hauptziel">
  <div className="rfc-head"><div><small>RACE INTELLIGENCE / RENNWETTER</small>
   <h2>Wetter am Renntag.</h2>
   <p>{race?race.race_date.split('-').reverse().join('.')+' · '+race.race_name:'Dein nächstes Hauptziel'} · {placeName||race?.race_location||'Ort offen'}</p>
  </div><span>START BIS ZIEL</span></div>
  {loading&&<p className="rfc-info">Prüfe die verfügbare Stundenprognose …</p>}
  {!loading&&!race&&<p className="rfc-info">Speichere zuerst ein Hauptziel.</p>}
  {!loading&&race&&!race.race_start_time&&<p className="rfc-info">Startzeit im Hauptziel ergänzen, damit wir das Wetter entlang deines Rennzeitraums prüfen.</p>}
  {!loading&&race&&!race.target_hours&&<p className="rfc-info">Zielzeit ergänzen, um den Wetterverlauf bis zum Ziel zu prüfen.</p>}
  {!loading&&race&&start!==null&&duration!==null&&!complete&&
   <p className="rfc-info">Für den kompletten Zeitraum liegt noch keine belastbare Stundenprognose vor.
    Wir zeigen bewusst keine erfundenen Werte. Der Forecast wird näher am Renntag automatisch verfügbar.</p>}
  {info&&<div className="rfc-summary">
    <div><strong>{info.temp?.[0]}–{info.temp?.[1]}°C</strong><small>Temperaturverlauf</small></div>
    <div><strong>{info.rain} %</strong><small>Max. Regenwahrscheinlichkeit</small></div>
    <div><strong>{Math.round(info.gust)} km/h</strong><small>Max. Böen</small></div>
   </div>}
  {info&&<p className="rfc-hints">{info.changes.length?info.changes.join(' · '):'Keine markanten Wetteränderungen in der aktuellen Prognose.'}</p>}
  {info&&full&&<details className="rfc-details">
    <summary>Wetterverlauf über {duration} Stunden ansehen</summary>
    <div className="rfc-timeline">
     {full.segments.map(h=><div key={h.epoch}><b>{String(h.hour).padStart(2,'0')}:00</b>
      <strong>{Math.round(h.temperature)}°C · {weatherLabel(h.code)}</strong>
      <span>Regen {Math.round(h.rainProbability)} % · Böen {Math.round(h.gust)} km/h</span>
     </div>)}
    </div>
   </details>}
  {error&&<p className="rfc-error" role="alert">{error}</p>}
  <p className="rfc-foot">Stadtprognose {placeName||'am Veranstaltungsort'} · Quelle Open-Meteo
   {report?' · Abruf '+new Date(report.fetchedAt).toLocaleString('de-DE',{hour:'2-digit',minute:'2-digit'}):''}.
   Keine Aussage über lokalen Windschutz oder Schatten an einzelnen Abschnitten.</p>
 </section>
}

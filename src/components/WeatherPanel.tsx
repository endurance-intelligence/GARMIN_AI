import {useEffect,useRef,useState} from 'react'
import {
 bestTrainingSlot,findPlaces,getWeather,hourAt,localParts,localToday,
 raceSegments,validPlace,weatherLabel
} from '../lib/weatherIntelligence'
import type {WeatherPlace,Forecast,WeatherHour} from '../lib/weatherIntelligence'
import '../styles/weather-panel.css'

type Mode='training'|'race'
const trainKey='garmin-ai-weather-place-training-v1'
const raceKey='garmin-ai-weather-place-race-v1'
function stored(key:string):WeatherPlace|null{
 try{
  const raw=window.localStorage.getItem(key)
  if(!raw)return null
  const place=JSON.parse(raw) as unknown
  return validPlace(place)?place:null
 }catch{return null}
}
function label(place:WeatherPlace){
 return [place.name,place.admin1,place.country].filter(Boolean).join(', ')
}
function fmt(n:number,unit=''){
 return (Number.isFinite(n)?Math.round(n).toLocaleString('de-DE'):'–')+unit
}
function hr(n:number){return String(n).padStart(2,'0')+':00'}
function condition(w:WeatherHour){
 return weatherLabel(w.code)
}
function hourDay(w:WeatherHour){
 return new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'short'}).format(
  new Date(w.date+'T12:00:00Z'))
}

export function WeatherPanel({active,mode='training',date,fixedTime,compact=false}:{
 active:boolean;mode?:Mode;date?:string;fixedTime?:string|null;compact?:boolean
}){
 const key=mode==='race'?raceKey:trainKey
 const [place,setPlace]=useState<WeatherPlace|null>(()=>stored(key))
 const [query,setQuery]=useState(mode==='race'?'Fulda':'')
 const [choices,setChoices]=useState<WeatherPlace[]>([])
 const [report,setReport]=useState<Forecast|null>(null)
 const [loading,setLoading]=useState(false)
 const [searching,setSearching]=useState(false)
 const [error,setError]=useState('')
 const [searchError,setSearchError]=useState('')
 const [reload,setReload]=useState(0)
 const lastReload=useRef(0)
 const [raceDate,setRaceDate]=useState('')
 const [raceTime,setRaceTime]=useState('')
 const [raceDuration,setRaceDuration]=useState(15)
 const [duration,setDuration]=useState(60)
 const [searchOpen,setSearchOpen]=useState(false)
 const [geoBusy,setGeoBusy]=useState(false)
 const [compactExpanded,setCompactExpanded]=useState(false)

 useEffect(()=>{
  if(!active)return
  const previous=stored(key)
  if(previous&&(!place||previous.latitude!==place.latitude||previous.longitude!==place.longitude))
    setPlace(previous)
 },[active,key])

 useEffect(()=>{
  if(!active||!place)return
  let mounted=true
  setLoading(true);setError('')
  const force=reload!==lastReload.current
  lastReload.current=reload
  void getWeather(place,force).then(next=>{
   if(mounted)setReport(next)
  }).catch(()=>{
   if(mounted){setReport(null);setError('Wettervorhersage derzeit nicht erreichbar.')}
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active,place?.latitude,place?.longitude,reload])

 async function search(){
  if(query.trim().length<2)return
  setSearchError('');setSearching(true);setChoices([])
  try{
   const found=await findPlaces(query)
   setChoices(found)
   if(!found.length)setSearchError('Kein Ort gefunden. Bitte genauer suchen.')
  }catch{
   setSearchError('Ortssuche nicht verfügbar. Erneut versuchen.')
  }finally{setSearching(false)}
 }
 function choose(next:WeatherPlace){
  if(!validPlace(next))return
  window.localStorage.setItem(key,JSON.stringify(next))
  setPlace(next);setReport(null);setChoices([]);setSearchOpen(false)
  setError('');setQuery('')
 }
 function currentLocation(){
  if(!navigator.geolocation){setSearchError('Standortzugriff wird hier nicht unterstützt.');return}
  setGeoBusy(true);setSearchError('')
  navigator.geolocation.getCurrentPosition(
   ({coords})=>{
    // Round to approx. one kilometer; no precise address is stored.
    choose({name:'Mein Standort (ungefähr)',
      latitude:Math.round(coords.latitude*100)/100,
      longitude:Math.round(coords.longitude*100)/100})
    setGeoBusy(false)
   },
   ()=>{setSearchError('Standort nicht freigegeben. Du kannst stattdessen einen Ort suchen.');setGeoBusy(false)},
   {enableHighAccuracy:false,timeout:12000,maximumAge:15*60*1000}
  )
 }
 const day=mode==='race'?raceDate:(date|| (report?localToday(report.timezone):''))
 const fixedHour=fixedTime&&/^\d{2}:\d{2}$/.test(fixedTime)?Number(fixedTime.slice(0,2)):null
 const slot=report&&mode==='training'&&fixedHour===null?
  bestTrainingSlot(report,day,duration):null
 const fixedWeather=report&&mode==='training'&&fixedHour!==null?
  hourAt(report,day,fixedHour):null
 const now=report?localParts(Math.floor(Date.now()/1000),report.timezone):null
 const live=report?.hours.find(h=>h.date===now?.date&&h.hour===now?.hour)
 const start=mode==='race'&&raceTime&&/^\d{2}:\d{2}$/.test(raceTime)?Number(raceTime.slice(0,2)):null
 const race=report&&raceDate&&start!==null?
  raceSegments(report,raceDate,start,raceDuration):null
 const upperDate=report?.hours.at(-1)?.date
 const forecastDateMissing=day&&report&&((report.hours[0]?.date||'9999')>day||(upperDate||'')<day)
 const showUnavailable=mode==='race'&&raceDate&&forecastDateMissing


 if(compact&&mode==='training'){
  const glyph=live?
   (live.code>=95?'⛈️':live.code>=71?'🌨️':live.code>=51?'🌧️':
    live.code>=45?'🌫️':live.code>=3?'☁️':live.code>=1?'🌤️':live.isDay?'☀️':'🌙'):'🌤️'
  const summary=fixedWeather?
   ('Wetter um '+hr(fixedHour!)+' · '+fmt(fixedWeather.temperature,'°')+' · '+condition(fixedWeather)):
   slot?('Bester Wetterslot '+hr(slot.startHour)+'–'+hr(slot.startHour+Math.ceil(slot.durationMinutes/60))):
   place?'Kein Wetterfenster verfügbar':'Trainingsort auswählen'
  const detail=fixedWeather?
   'Regen '+fmt(fixedWeather.rainProbability,'%')+' · Wind '+fmt(fixedWeather.wind,' km/h'):
   slot?(slot.reason+' · '+fmt(slot.hours[0].temperature,'°')+' · Regen '+fmt(Math.max(...slot.hours.map(h=>h.rainProbability)),'%')):
   place?'Wettervorhersage noch nicht verfügbar':'Ort suchen oder freiwillig Standort teilen'
  return <section className="wx-brief" aria-label="Trainingswetter auf einen Blick">
   <div className="wx-brief-line">
    <span className="wx-brief-glyph" role="img" aria-label={live?condition(live):'Wetter'}>{glyph}</span>
    <div className="wx-brief-info">
     <span>{place?place.name:'Wetter'} {live?('· '+fmt(live.temperature,'°')):''}</span>
     <strong>{loading&&!report?'Wetter wird geladen …':summary}</strong>
     <small>{detail}</small>
    </div>
    <button type="button" className="wx-brief-more" aria-expanded={compactExpanded}
     aria-label="Wetterdetails und Standort"
     onClick={()=>{setCompactExpanded(v=>!v);if(!place)setSearchOpen(true)}}>
     {compactExpanded?'Weniger':'Details'}
    </button>
   </div>
   {error&&<p className="wx-error" role="alert">{error}</p>}
   {compactExpanded&&<div className="wx-brief-details">
    <div className="wx-brief-tools">
     <span>{place?label(place):'Noch kein Ort gewählt'}</span>
     <button type="button" onClick={()=>setSearchOpen(v=>!v)}>{place?'Ort ändern':'Ort wählen'}</button>
    </div>
    {searchOpen&&<div className="wx-place-search">
     <form onSubmit={event=>{event.preventDefault();void search()}}>
      <label htmlFor={'wx-brief-search-'+mode}>Stadt oder Ort</label>
      <div className="wx-search-row"><input
       id={'wx-brief-search-'+mode} value={query}
       onChange={e=>setQuery(e.target.value)} minLength={2} maxLength={90}
       placeholder="Ort suchen" autoComplete="off"/>
       <button type="submit" disabled={searching||query.trim().length<2}>
        {searching?'Suche …':'Suchen'}
       </button>
      </div>
     </form>
     <button type="button" className="wx-geolocate" onClick={currentLocation}
      disabled={geoBusy}>{geoBusy?'Standort wird geprüft …':'Meinen Standort verwenden (optional)'}</button>
     {searchError&&<p className="wx-error" role="alert">{searchError}</p>}
     {choices.length>0&&<div className="wx-results" role="group" aria-label="Ort auswählen">
      {choices.map((p,i)=><button type="button" key={p.name+p.latitude+p.longitude+i}
       onClick={()=>choose(p)}>{label(p)}</button>)}
     </div>}
    </div>}
    {place&&<div className="wx-brief-settings">
     <span>Wetterbasierter Vergleich · nicht dein Terminkalender</span>
     {fixedHour===null&&<label>Dauer <select value={duration}
      onChange={e=>setDuration(Number(e.target.value))}>
      {[30,60,90,120,180].map(d=><option key={d} value={d}>{d} Min.</option>)}
     </select></label>}
     <button type="button" disabled={loading} onClick={()=>setReload(n=>n+1)}>Aktualisieren</button>
    </div>}
    {live&&<p className="wx-brief-data">Gefühlt {fmt(live.feelsLike,'°')} · Wind {fmt(live.wind,' km/h')} · Böen {fmt(live.gust,' km/h')}</p>}
    <p className="wx-brief-source">Quelle: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Wetter ist keine Trainingsfreigabe.</p>
   </div>}
  </section>
 }

 return <article className={'wx-panel wx-'+mode} aria-label={mode==='race'?'Wetter für das Rennen':'Trainingswetter'}>
  <div className="wx-head">
   <div><span className="wx-kicker">WETTER INTELLIGENCE / {mode==='race'?'RACE PREP':'TRAINING'}</span>
    <h3>{mode==='race'?'Rennwetter':'Dein Trainingswetter'}</h3>
    <p>{mode==='race'?'Wetter am Veranstaltungsort, passend zu Start und Renndauer.':
      'Wetter am Trainingsort und ein passendes Zeitfenster, wenn keine Startzeit geplant ist.'}</p>
   </div>
   <span className="wx-badge">{place?'STANDORT GEWÄHLT':'ORT FEHLT'}</span>
  </div>
  <div className="wx-location">
   <div className="wx-place">
    <span>STANDORT</span>
    <strong>{place?label(place):'Noch keinen Ort festgelegt'}</strong>
    <small>{place?'Lokal auf diesem Gerät gespeichert':'Ort suchen oder Standort einmalig freigeben'}</small>
   </div>
   <button className="wx-action" type="button" onClick={()=>setSearchOpen(v=>!v)}>
    {searchOpen?'Schließen':place?'Ort ändern':'Ort wählen'}
   </button>
  </div>
  {searchOpen&&<div className="wx-place-search">
   <form onSubmit={event=>{event.preventDefault();void search()}}>
    <label htmlFor={'wx-search-'+mode}>Ort oder Stadt</label>
    <div className="wx-search-row">
     <input id={'wx-search-'+mode} value={query} onChange={e=>setQuery(e.target.value)}
      placeholder={mode==='race'?'z. B. Fulda':'Ort suchen'} minLength={2}
      maxLength={90} autoComplete="off"/>
     <button type="submit" disabled={searching||query.trim().length<2}>
      {searching?'Suche …':'Suchen'}
     </button>
    </div>
   </form>
   <button className="wx-geolocate" type="button" disabled={geoBusy}
    onClick={currentLocation}>
    {geoBusy?'Standort wird geprüft …':'Aktuellen Standort verwenden (optional)'}
   </button>
   {searchError&&<p className="wx-error" role="alert">{searchError}</p>}
   {choices.length>0&&<div className="wx-results" role="group" aria-label="Ort auswählen">
    {choices.map((p,i)=><button type="button" key={p.name+p.latitude+p.longitude+i}
     onClick={()=>choose(p)}>{label(p)}</button>)}
   </div>}
  </div>}
  {place&&<div className="wx-refresh">
   <span>{loading?'Aktualisiere Wetter …':report?
    'Vorhersage · aktualisiert '+new Date(report.fetchedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):
    'Noch keine Vorhersage geladen'}</span>
   <button type="button" disabled={loading} onClick={()=>setReload(x=>x+1)}>Neu laden</button>
  </div>}
  {error&&<p className="wx-error" role="alert">{error}</p>}
  {report&&mode==='training'&&<>
   {live&&<div className="wx-now">
    <div><small>JETZT · {condition(live)}</small><strong>{fmt(live.temperature,'°')}</strong>
     <span>Gefühlt {fmt(live.feelsLike,'°')} · {fmt(live.humidity,'%')} Luftfeuchte</span>
    </div>
    <div className="wx-now-side"><span>Regen <strong>{fmt(live.rainProbability,'%')}</strong></span>
     <span>Wind <strong>{fmt(live.wind,' km/h')}</strong></span>
     <span>Böen <strong>{fmt(live.gust,' km/h')}</strong></span>
    </div>
   </div>}
   <div className="wx-slot-toolbar">
    <strong>{fixedHour===null?'Bestes Wetterfenster':'Wetter zur geplanten Uhrzeit'}</strong>
    {fixedHour===null&&<label>Geschätzte Dauer
     <select value={duration} onChange={e=>setDuration(Number(e.target.value))}>
      <option value={30}>30 Min.</option><option value={60}>60 Min.</option>
      <option value={90}>90 Min.</option><option value={120}>120 Min.</option>
      <option value={180}>180 Min.</option>
     </select>
    </label>}
   </div>
   {slot&&<div className={'wx-slot wx-level-'+slot.level}>
    <span>WETTERVERGLEICH · {slot.level.toUpperCase()}</span>
    <strong>{hr(slot.startHour)} – {hr(slot.startHour+Math.ceil(slot.durationMinutes/60))}</strong>
    <p>{slot.reason}</p>
    <div className="wx-metrics">
     <span>{fmt(slot.hours[0].temperature,'°C')}</span>
     <span>{Math.max(...slot.hours.map(h=>h.rainProbability))}% Regenrisiko</span>
     <span>{fmt(Math.max(...slot.hours.map(h=>h.gust)),' km/h')} Böen</span>
    </div>
   </div>}
   {!slot&&fixedWeather&&<div className="wx-slot">
    <span>GEPLANTE STARTZEIT · {hr(fixedHour!)}</span>
    <strong>{fmt(fixedWeather.temperature,'°C')} · {condition(fixedWeather)}</strong>
    <p>Regen {fmt(fixedWeather.rainProbability,'%')} · Böen {fmt(fixedWeather.gust,' km/h')}</p>
   </div>}
   {!slot&&!fixedWeather&&<p className="wx-empty">
    {forecastDateMissing?'Für diesen Tag liegt noch keine Stundenprognose vor.':
     'Für heute ist kein zukünftiges Zeitfenster in den gewählten Stunden verfügbar.'}
   </p>}
   <p className="wx-note">Wetterbasierter Vergleich, keine Trainingsfreigabe. Verfügbarkeit, feste Termine, Erholung und Belastung berücksichtigt der Coach gesondert.</p>
  </>}
  {mode==='race'&&<>
   <div className="wx-race-fields">
    <label>Renndatum<input type="date" value={raceDate} min={report?localToday(report.timezone):undefined} onChange={e=>setRaceDate(e.target.value)}/></label>
    <label>Startzeit vor Ort<input type="time" value={raceTime}
     onChange={e=>setRaceTime(e.target.value)}/></label>
    <label>Renndauer (Plan)<select value={raceDuration}
     onChange={e=>setRaceDuration(Number(e.target.value))}>
      {[1,2,3,4,6,8,10,12,15,18,24,30,36,48].map(n=>
       <option key={n} value={n}>{n} h</option>)}
     </select></label>
   </div>
   {!raceDate&&<p className="wx-empty">Renndatum eintragen. Ohne Eventdatum gibt es keine seriöse Rennwetter-Einschätzung.</p>}
   {raceDate&&!raceTime&&<p className="wx-empty">Startzeit ergänzen, um Wetterabschnitte über die Renndauer zu vergleichen.</p>}
   {showUnavailable&&<div className="wx-outside">
    <strong>Noch keine verlässliche Rennprognose</strong>
    <p>Die Stundenprognose reicht maximal 16 Tage voraus. Für spätere Rennen planen wir zunächst ohne konkrete Wetterwerte; die tatsächliche Vorhersage folgt in der Rennwoche.</p>
   </div>}
   {race&&<div className="wx-race-result">
    <div className="wx-race-status"><strong>{race.complete?'Stundenprognose verfügbar':'Nur teilweise Wetterstunden verfügbar'}</strong>
     <small>{race.complete?'3-Stunden-Abschnitte ab Rennstart':'Keine vollständige Vorhersage für die gesamte Renndauer'}</small></div>
    <div className="wx-race-steps">
     {race.segments.map((w,i)=><div className="wx-race-step" key={w.epoch}>
      <span>{i*3} h · {hourDay(w)} {hr(w.hour)}</span>
      <strong>{fmt(w.temperature,'°C')} · {condition(w)}</strong>
      <small>Gefühlt {fmt(w.feelsLike,'°')} · Regen {fmt(w.rainProbability,'%')} · Böen {fmt(w.gust,' km/h')}</small>
     </div>)}
    </div>
    <p className="wx-note">Stündliche Auflösung: Startzeiten mit Minuten werden der jeweiligen Stunde zugeordnet.</p>
    <p className="wx-note">Die Rennwetteranzeige ist eine Prognose, keine Zusage. Später verknüpfen wir sie mit GPX, Windrichtung und Fueling-Phasen.</p>
   </div>}
  </>}
  <p className="wx-source">Wetterdaten: <a href="https://open-meteo.com/" target="_blank"
   rel="noreferrer">Open-Meteo</a> · Standort wird nur nach deiner Auswahl verwendet · Vorhersagen können sich ändern.</p>
 </article>
}

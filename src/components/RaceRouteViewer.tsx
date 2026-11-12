import {useEffect,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import type {Forecast,WeatherHour} from '../lib/weatherIntelligence'
import {parseGpxTrack,routeSvg,windSegments} from '../lib/gpxRaceRoute.mjs'
import {komootEmbedFromTour} from '../lib/komootEmbed.mjs'
import type {Point} from '../lib/gpxRaceRoute.mjs'
import '../styles/race-route-viewer.css'
type Saved={race_date:string;route_url:string;coordinates:Point[];distance_m:number;
 ascent_m:number;descent_m:number;saved_at:string}
type Loaded={route:Saved|null;reusedFrom:string|null;routeUrl?:string;raceDate?:string;
 raceStartTime?:string|null;reason?:string}
type Draft={points:Point[];distanceM:number;ascentM:number;descentM:number;originalPoints:number}
async function request(body?:Record<string,unknown>):Promise<Loaded&{saved?:boolean}>{
 if(!garminSupabase)throw Error('Bitte anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden.')
 const result=await fetch(garminSupabaseUrl+'/functions/v1/garmin-race-route',{
  method:body?'POST':'GET',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 })
 const json=await result.json().catch(()=>({})) as Loaded&{saved?:boolean;error?:string}
 if(!result.ok)throw Error(json.error||'Streckenservice nicht erreichbar')
 return json
}
export function RaceRouteViewer({active,refreshKey=0,forecast,onTrack}:{active:boolean;refreshKey?:number;forecast:Forecast|null;onTrack?:(points:Point[]|null)=>void}){
 const [loaded,setLoaded]=useState<Loaded|null>(null)
 const [draft,setDraft]=useState<Draft|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [position,setPosition]=useState(0)
 const loadedRefreshKey=useRef<number|null>(null)
 useEffect(()=>{
  // Keep the loaded GPX and any unsaved preview while changing app tabs.
  if(!active||loadedRefreshKey.current===refreshKey)return
  let alive=true;setLoaded(null);setDraft(null);setError('')
  void request().then(x=>{if(alive){setLoaded(x);loadedRefreshKey.current=refreshKey}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Strecke nicht abrufbar')})
  return ()=>{alive=false}
 },[active,refreshKey])
 useEffect(()=>{
  if(!loaded)return
  onTrack?.(draft?.points||loaded.route?.coordinates||null)
 },[loaded?.route,draft])
 async function openFile(file:File|undefined){
  if(!file)return
  setError('');setNotice('')
  if(file.size>4*1024*1024){setError('Bitte eine GPX-Datei bis 4 MB auswählen.');return}
  try{const parsed=parseGpxTrack(await file.text())
   setDraft(parsed);setPosition(0)
   setNotice('GPX-Vorschau geladen. Speichere sie erst nach Prüfung für diese Austragung.')
  }catch(e){setError(e instanceof Error?e.message:'Datei nicht lesbar')}
 }
 async function save(){
  if(!loaded?.routeUrl||!loaded.raceDate||!draft||busy)return
  setBusy(true);setError('')
  try{
   const response=await request({action:'save',confirm:true,routeUrl:loaded.routeUrl,
    raceDate:loaded.raceDate,coordinates:draft.points})
   if(!response.saved||!response.route)throw Error('GPX nicht bestätigt.')
   setLoaded(old=>({...old!,route:response.route,reusedFrom:null}))
   setDraft(null)
   setNotice('Strecke für diese Austragung gespeichert. Ältere Ausgaben bleiben erhalten.')
  }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen')}
  finally{setBusy(false)}
 }
 if(!active)return null
 const komoot=komootEmbedFromTour(loaded?.routeUrl||null)
 const points=draft?.points||loaded?.route?.coordinates||[]
 const model=routeSvg(points)
 const selected=model?Math.round(position/100*(model.positions.length-1)):0
 const selectedPoint=model?.positions[selected]
 const altitudes=points.filter(p=>p.length===3).map(p=>p[2])
 const altMin=Math.min(...altitudes),altMax=Math.max(...altitudes)
 const altPath=altitudes.length>2?altitudes.map((alt,i)=>{
  const x=16+i/(altitudes.length-1)*608
  const y=96-(alt-altMin)/Math.max(1,altMax-altMin)*73
  return (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1)
 }).join(' '):null
 const weather:WeatherHour|null=loaded?.raceStartTime?
  forecast?.hours.find(x=>x.date===loaded.raceDate&&x.hour===Number(loaded.raceStartTime!.slice(0,2)))||null:null
 const wind=weather?.windDirection!==undefined?
  windSegments(points,weather.windDirection,weather.wind):[]
 return <section className="rrv-root" aria-label="Streckenkarte und Streckenwetter">
  <div className="rrv-head"><div><small>RACE INTELLIGENCE / STRECKE</small>
   <h2>Dein Kurs auf einen Blick.</h2>
   <p>GPX-basierte Streckenansicht, Höhenprofil und Wetterhinweise zur Laufrichtung.</p>
  </div>{loaded?.routeUrl&&<a href={loaded.routeUrl} target="_blank" rel="noreferrer">
   Originalkarte öffnen</a>}</div>
  {!loaded&&!error&&<p className="rrv-info">Lade deine gespeicherte Wettkampfstrecke …</p>}
  {komoot&&<div className="rrv-komoot">
   <div className="rrv-komoot-top"><strong>Komoot · Interaktive Karte & Höhenprofil</strong>
    <span>Direkt aus der gespeicherten Event-Strecke</span></div>
   <iframe title={'Komoot-Karte und Höhenprofil der Tour '+komoot.id}
    src={komoot.url} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
    allowFullScreen/>
   <p>Offizielle Komoot-Einbettung. Bei privaten oder entfernten Touren kann die Karte
    eingeschränkt sein. Über „Originalkarte öffnen“ gelangst du immer direkt zur Quelle.</p>
  </div>}
  {loaded?.reason==='no_saved_route_link'&&
   <p className="rrv-info">Bitte zuerst die Veranstaltungsdaten mit dem Streckenlink im Event Scout speichern.</p>}
  {loaded?.routeUrl&&<details className="rrv-gpx-advanced"><summary>Optionale GPX-Analyse für Gegenwindabschnitte</summary><div className="rrv-tools">
   <label className="rrv-file">GPX-Strecke auswählen
    <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml"
     onChange={e=>{void openFile(e.target.files?.[0]);e.target.value=''}}/></label>
   {draft&&<button type="button" disabled={busy} onClick={()=>void save()}>
     {busy?'Speichere …':'Diese Strecke speichern'}</button>}
   <span>{loaded.reusedFrom?'Strecke aus '+loaded.reusedFrom.split('-').reverse().join('.')+' übernommen':
    loaded.route?'Strecke für diese Austragung gespeichert':'Noch keine GPX-Geometrie gespeichert'}</span>
  </div><p>Für unsere eigene richtungsabhängige Windanalyse braucht GARMIN_AI
   die GPS-Punkte. Die Komoot-Karte mit Höhenprofil funktioniert bereits ohne GPX.</p>
   </details>}
  {loaded?.routeUrl&&!model&&!komoot&&<p className="rrv-info">Dieser Link kann nicht direkt
   als Komoot-Tour eingebettet werden. Nutze die Originalkarte oder lade optional eine GPX-Datei für eigene Streckenanalysen.</p>}
  {model&&<details className="rrv-own-analysis"><summary>Eigene GPX-Streckenanalyse & Gegenwind anzeigen</summary><div className="rrv-canvas">
   <div className="rrv-map">
    <svg viewBox="0 0 640 300" role="img" aria-label="Geometrischer Streckenverlauf mit ausgewähltem Punkt">
     <defs><linearGradient id="rrv-line" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#80a6ff"/><stop offset="1" stopColor="#9ae6cb"/></linearGradient></defs>
     <rect width="640" height="300" fill="#101e32" rx="18"/>
     <path d="M20 75H620M20 150H620M20 225H620M160 20V280M320 20V280M480 20V280" stroke="#273752" strokeWidth="1" fill="none"/>
     <polyline points={model.polyline} fill="none" stroke="url(#rrv-line)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>
     <circle cx={model.positions[0][0]} cy={model.positions[0][1]} r="8" fill="#8fe2b2" stroke="#0b1b2b" strokeWidth="2"/>
     {selectedPoint&&<circle cx={selectedPoint[0]} cy={selectedPoint[1]} r="7" fill="#e8d5ff" stroke="#1f234a" strokeWidth="2"/>}
    </svg>
    <small>Schematische GPS-Streckenansicht – für die vollständige Basiskarte „Originalkarte öffnen“ nutzen.</small>
   </div>
   <div className="rrv-info-grid">
    <span><b>{(model.totalM/1000).toLocaleString('de-DE',{maximumFractionDigits:2})} km</b> GPS-Distanz</span>
    <span><b>{Math.round(draft?.ascentM||loaded?.route?.ascent_m||0)} m</b> Anstieg (GPX)</span>
    <span><b>{Math.round(draft?.descentM||loaded?.route?.descent_m||0)} m</b> Abstieg (GPX)</span>
   </div>
   <label className="rrv-scrub">Strecke erkunden · bei km {(model.cumulative[selected]/1000).toLocaleString('de-DE',{maximumFractionDigits:2})}
    <input type="range" min="0" max="100" step="1" value={position} onChange={e=>setPosition(Number(e.target.value))}/></label>
   {altPath&&<div className="rrv-elevation"><strong>Höhenprofil · ca. {Math.round(altMin)} bis {Math.round(altMax)} m</strong>
    <svg viewBox="0 0 640 116" role="img" aria-label="Höhenprofil aus GPX-Höhenangaben">
     <path d={altPath} stroke="#a2b3ff" strokeWidth="3" fill="none" strokeLinecap="round"/>
     <path d="M15 99H625" stroke="#4a597a" strokeWidth="1"/>
    </svg></div>}
   {weather?<div className="rrv-weather">
    <strong>Streckenwetter zum Start · Wind {Math.round(weather.wind)} km/h</strong>
    {wind.length>0?wind.map(x=><p key={x.fromKm+'-'+x.toKm}>Mögliche Gegenwind-Komponente
     auf km {x.fromKm.toLocaleString('de-DE')}–{x.toKm.toLocaleString('de-DE')}: rund {x.headwindKmh} km/h.</p>):
     <p>Keine eindeutige größere Gegenwind-Komponente aus der Startprognose ableitbar.</p>}
    {weather.uvIndex!==undefined&&weather.uvIndex>=4&&<p>Erhöhter UV-Index – Sonnenschutz erwägen.</p>}
    <small>Nur Laufrichtung und Windrichtung berechnet: keine Aussage über Abschirmung durch Bäume oder Gebäude,
     Streckenschatten oder den Wind zu jeder späteren Rennrunde.</small>
   </div>:<p className="rrv-info">Abschnittsbezogenes Wetter erst möglich, sobald GPX und Windrichtungsprognose vorliegen.</p>}
  </div></details>}
  {notice&&<p className="rrv-ok" role="status">{notice}</p>}
  {error&&<p className="rrv-error" role="alert">{error}</p>}
 </section>
}

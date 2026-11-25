import {useCallback,useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {parseGpxTrack,inferCourseType} from '../lib/gpxRaceRoute.mjs'
import {komootEmbedFromTour} from '../lib/komootEmbed.mjs'
import {VenueAutocomplete} from './VenueAutocomplete'
import type {VenueSuggestion} from './VenueAutocomplete'
import {Icon} from './Icon'
import type {GoalRouteSummary} from '../lib/goalRouteSummary'

type Goal={raceDate:string;raceName:string;raceLocation:string;raceStartTime?:string|null}
type Details={eventKind?:string;routeUrl?:string|null;courseType?:string|null;venue?:string|null;venueAddress?:string|null;city?:string|null;finishVenue?:string|null;finishCity?:string|null;finishAddress?:string|null;startLatitude?:number|null;startLongitude?:number|null;ascentM?:number|null;routeNotes?:string|null}
type ImportedTour={tourId:string;name:string|null;distanceM:number|null;ascentM:number|null;descentM:number|null;start:{latitude:number;longitude:number}|null}
type RecordRow={event_title:string;details:Details;event_url:string}
type Draft={route:string;course:string;start:string;city:string;venue:string;lat:string;lon:string;finish:string;finishCity:string;ascent:string;notes:string}
const blank=(city=''):Draft=>({route:'',course:'',start:'',city,venue:'',lat:'',lon:'',finish:'',finishCity:'',ascent:'',notes:''})
const courses=[['','Noch offen'],['out_and_back','Hin und zurück'],['loop','Rundkurs'],['point_to_point','A nach B'],['multi_loop','Mehrere Runden']]
const asDraft=(d:Details,city:string):Draft=>({route:d.routeUrl||'',course:d.courseType||'',start:d.venueAddress||d.venue||'',city:d.city||city,venue:d.venue||'',lat:d.startLatitude==null?'':String(d.startLatitude),lon:d.startLongitude==null?'':String(d.startLongitude),finish:d.finishAddress||d.finishVenue||'',finishCity:d.finishCity||'',ascent:d.ascentM==null?'':String(d.ascentM),notes:d.routeNotes||''})
async function request(body?:object){
 if(!garminSupabase)throw Error('Bitte anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden.')
 const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-race-research',{method:body?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const result=await res.json()
 if(!res.ok)throw Error(result.error||'Zieldetails nicht verfügbar.')
 return result
}
export function ChallengeSetup({active,revision,onSaved,onEventScout,onRouteSummary}:{active:boolean;revision:number;onSaved:()=>void;onEventScout:()=>void;onRouteSummary?:(value:GoalRouteSummary|null)=>void}){
 const [goal,setGoal]=useState<Goal|null>(null),[saved,setSaved]=useState<Details|null>(null)
 const [draft,setDraft]=useState<Draft>(blank()),[editing,setEditing]=useState(false)
 const [imported,setImported]=useState<ImportedTour|null>(null),[importing,setImporting]=useState(false),[importMessage,setImportMessage]=useState(''),[importRetry,setImportRetry]=useState(0)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
 useEffect(()=>{
  if(!active)return
  let alive=true;setLoading(true);setError('')
  void request().then(data=>{
   if(!alive)return
   const g=data.goal as Goal
   const row=(data.saved as RecordRow[]||[]).find(x=>x.event_title===g.raceName)||null
   setGoal(g);setSaved(row?.details||null);setDraft(row?asDraft(row.details,g.raceLocation):blank(g.raceLocation));setEditing(false)
  }).catch(e=>{if(alive){setGoal(null);setError(e instanceof Error?e.message:'Nicht verfügbar')}}).finally(()=>{if(alive)setLoading(false)})
  return ()=>{alive=false}
 },[active,revision])
 // Only import while editing, after a complete URL has been pasted.
 // An obsolete response may never update a different tour or goal.
 useEffect(()=>{
  setImported(null);setImportMessage('');setImporting(false)
  if(!active||!editing||!goal||!komootEmbedFromTour(draft.route))return
  let alive=true
  const link=draft.route
  const timer=window.setTimeout(()=>{
   setImporting(true)
   void request({action:'import_komoot',raceDate:goal.raceDate,raceName:goal.raceName,url:link}).then(result=>{
    if(!alive)return
    if(!result.available||!result.metadata){setImportMessage(result.message||'Komoot liefert keine auslesbaren Tourdaten.');return}
    const m=result.metadata as ImportedTour
    setImported(m)
    setDraft(d=>d.route!==link?d:{...d,
     ascent:d.ascent||(m.ascentM!==null?String(m.ascentM):''),
     ...(!d.lat&&!d.lon&&m.start?{lat:String(m.start.latitude),lon:String(m.start.longitude),start:d.start||'GPS-Startpunkt der Komoot-Tour'}:{})
    })
    setImportMessage('Tourdaten geladen. Leere Felder wurden ergänzt – vor dem Speichern prüfen.')
   }).catch(()=>{if(alive)setImportMessage('Tourdaten nicht abrufbar. Karte oder GPX verwenden.')}).finally(()=>{if(alive)setImporting(false)})
  },650)
  return ()=>{alive=false;window.clearTimeout(timer)}
 },[active,editing,goal?.raceDate,goal?.raceName,draft.route,importRetry])
 function applyTour(){
  if(!imported||busy)return
  setDraft(d=>({...d,ascent:imported.ascentM===null?d.ascent:String(imported.ascentM),
   ...(imported.start?{lat:String(imported.start.latitude),lon:String(imported.start.longitude),start:'GPS-Startpunkt der Komoot-Tour',venue:''}:{})}))
  setImportMessage('Höhenmeter und GPS-Startpunkt aus Komoot übernommen. Bitte prüfen und speichern.')
 }
 useEffect(()=>{
  if(!active||loading||!goal||!saved){onRouteSummary?.(null);return}
  onRouteSummary?.({...saved,raceName:goal.raceName,raceDate:goal.raceDate})
 },[active,loading,goal,saved,onRouteSummary])
 const suggest=useCallback(async(query:string,city:string):Promise<VenueSuggestion[]>=>{
  const data=await request({action:'suggest_venues',raceDate:goal?.raceDate,query,city})
  return Array.isArray(data.suggestions)?data.suggestions:[]
 },[goal?.raceDate])
 async function inspectGpx(file:File|undefined){
  if(!file||busy)return
  setError('');setNotice('')
  try{
   if(file.size>4*1024*1024)throw Error('Bitte GPX-Datei bis 4 MB auswählen.')
   const track=parseGpxTrack(await file.text()),inferred=inferCourseType(track.points),first=track.points[0]
   const altitudeAvailable=track.points.every(p=>p.length===3)
   setDraft(d=>({...d,course:inferred||d.course,lat:String(first[0]),lon:String(first[1]),ascent:altitudeAvailable?String(Math.round(track.ascentM)):d.ascent}))
   setNotice('GPX ausgewertet: '+(track.distanceM/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km. Startkoordinaten und erkannte Angaben bitte prüfen. Die Ziel-Distanz bleibt unverändert. GPS-Strecke bei Bedarf in Race Prep speichern.')
  }catch(e){setError(e instanceof Error?e.message:'GPX nicht lesbar.')}
 }
 const update=(key:keyof Draft,value:string)=>setDraft(d=>{
  if(key!=='route'||komootEmbedFromTour(d.route)?.id===komootEmbedFromTour(value)?.id)return {...d,[key]:value}
  // Changing the tour invalidates previously imported GPS coordinates and ascent.
  // A typed start name is retained for review, but not an obsolete GPS pin.
  return {...d,route:value,lat:'',lon:'',ascent:'',
   start:d.start==='GPS-Startpunkt der Komoot-Tour'?'':d.start}
 })
 const pick=(item:VenueSuggestion)=>setDraft(d=>({...d,start:item.address||item.name,venue:item.name,city:item.city,lat:item.latitude==null?'':String(item.latitude),lon:item.longitude==null?'':String(item.longitude)}))
 async function save(){
  if(!goal||busy)return
  setBusy(true);setError('');setNotice('')
  try{
   if(draft.route.trim()&&!komootEmbedFromTour(draft.route.trim()))throw Error('Bitte einen vollständigen Komoot-Tour-Link einfügen.')
   if((draft.lat.trim()==='')!==(draft.lon.trim()===''))throw Error('Bitte beide Startkoordinaten angeben.')
   const result=await request({action:'save_challenge',confirm:true,raceDate:goal.raceDate,raceName:goal.raceName,details:{
    eventDate:goal.raceDate,eventName:goal.raceName,startTime:goal.raceStartTime?.slice(0,5)||null,endTime:null,
    routeUrl:draft.route.trim()||null,courseType:draft.course||null,venue:draft.venue||draft.start||null,venueAddress:draft.start||null,city:draft.city||null,
    startLatitude:draft.lat.trim()?Number(draft.lat):null,startLongitude:draft.lon.trim()?Number(draft.lon):null,
    finishVenue:draft.finish||null,finishCity:draft.finishCity||null,finishAddress:draft.finish||null,ascentM:draft.ascent.trim()?Number(draft.ascent):null,routeNotes:draft.notes||null
   }})
   if(!result.saved||!result.record)throw Error('Speicherung nicht bestätigt.')
   setSaved(result.record.details);setEditing(false);setNotice('Challenge gespeichert. Race Prep übernimmt deine Streckendaten.');onSaved()
  }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}
  finally{setBusy(false)}
 }
 if(!active)return null
 const route=komootEmbedFromTour(editing?draft.route:saved?.routeUrl||'')
 const isChallenge=saved?.eventKind==='challenge'
 return <section className="challenge-setup" aria-label="Zieldetails und Strecke">
  <header><div><span className="challenge-kicker">ROUTE</span><h2>Karte &amp; Höhenprofil</h2></div><div className="challenge-header-actions">{goal&&!loading&&<button className="challenge-edit-control" type="button" disabled={busy} onClick={()=>{setDraft(saved?asDraft(saved,goal.raceLocation):blank(goal.raceLocation));setEditing(x=>!x)}}><Icon name={editing?'x':'pencil'}/>{editing?'Abbrechen':isChallenge?'Bearbeiten':'Einrichten'}</button>}</div></header>
  {loading?<p role="status">Zieldetails werden geladen …</p>:goal&&<>
   {!isChallenge&&!editing&&<div className="challenge-actions"><button className="challenge-scout-link" type="button" disabled={busy} onClick={onEventScout}>Offizielles Event recherchieren <Icon name="arrow-up-right"/></button></div>}
   {!editing&&!route&&<p className="challenge-empty">Noch keine Tour verknüpft. Komoot-Link oder Streckendaten über Bearbeiten ergänzen.</p>}
   {editing&&<div className="challenge-form">
    <div className="challenge-wide challenge-route-input"><label>Komoot-Tour<input type="url" value={draft.route} placeholder="Komoot-Teilungslink einfügen" onChange={e=>update('route',e.target.value)}/></label>
     {komootEmbedFromTour(draft.route)&&<div className="challenge-import-status">
      <span role="status">{importing?'Komoot-Tourdaten werden geprüft …':importMessage||'Komoot-Tour erkannt'}</span>
      {!importing&&!imported&&importMessage&&<button type="button" className="challenge-scout-link" disabled={busy} onClick={()=>setImportRetry(x=>x+1)}>Erneut prüfen</button>}
     </div>}
     {imported&&<div className="challenge-import-preview"><div><strong>{imported.name||'Komoot-Tour'}</strong><small>{[imported.distanceM===null?null:(imported.distanceM/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km',imported.ascentM===null?null:'↗ '+imported.ascentM.toLocaleString('de-DE')+' m',imported.descentM===null?null:'↘ '+imported.descentM.toLocaleString('de-DE')+' m',imported.start?'GPS-Startpunkt vorhanden':null].filter(Boolean).join(' · ')}</small></div>
      <button type="button" disabled={busy} onClick={applyTour}>Tourwerte übernehmen</button></div>}
    </div>
    <label>Streckentyp<select value={draft.course} onChange={e=>update('course',e.target.value)}>{courses.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>Stadt / Region<input value={draft.city} maxLength={100} onChange={e=>{setDraft(d=>({...d,city:e.target.value,lat:'',lon:''}))}}/></label>
    <div><label>Genauer Startpunkt</label><VenueAutocomplete value={draft.start} city={draft.city} disabled={busy} request={suggest} onPick={pick} onChange={v=>setDraft(d=>({...d,start:v,venue:'',lat:'',lon:''}))}/></div>
    <label>Höhenmeter (optional)<input type="number" min="0" max="30000" value={draft.ascent} onChange={e=>update('ascent',e.target.value)}/></label>
    {draft.course==='point_to_point'&&<><label>Zielort<input value={draft.finish} onChange={e=>update('finish',e.target.value)}/></label><label>Zielstadt<input value={draft.finishCity} onChange={e=>update('finishCity',e.target.value)}/></label></>}
    <details className="challenge-coords"><summary>Alternative: GPX-Datei analysieren</summary><label>GPX auswählen<input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" disabled={busy} onChange={e=>{void inspectGpx(e.target.files?.[0]);e.target.value=''}}/></label></details>
    <details className="challenge-coords"><summary>{draft.lat&&draft.lon?'✓ GPS-Startpunkt hinterlegt':'GPS-Startpunkt präzisieren'}</summary><div className="challenge-coord-grid">
     <label>Breitengrad<input type="number" step="any" min="-90" max="90" value={draft.lat} onChange={e=>update('lat',e.target.value)}/></label><label>Längengrad<input type="number" step="any" min="-180" max="180" value={draft.lon} onChange={e=>update('lon',e.target.value)}/></label></div>
     <small>Mit Koordinaten wird die Wetterprognose für den Startpunkt statt für die Stadt geladen.</small></details>
    <label className="challenge-wide">Streckenhinweise<textarea rows={2} maxLength={240} value={draft.notes} onChange={e=>update('notes',e.target.value)}/></label>
    <button type="button" className="challenge-save" disabled={busy||importing} onClick={()=>void save()}>{busy?'Speichere …':'Challenge speichern'}</button>
   </div>}
   {route&&<div className="challenge-map"><div className="challenge-map-toolbar"><span>Interaktive Komoot-Tour</span><a href={editing?draft.route:saved?.routeUrl||route.canonicalUrl} target="_blank" rel="noreferrer">In Komoot öffnen <Icon name="arrow-up-right"/></a></div><iframe title="Komoot-Strecke und Höhenprofil" src={route.url} loading="lazy" referrerPolicy="no-referrer" allowFullScreen/></div>}
  </>}
  {error&&<p role="alert" className="challenge-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}

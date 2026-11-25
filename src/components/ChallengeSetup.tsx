import {useCallback,useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {komootEmbedFromTour} from '../lib/komootEmbed.mjs'
import {VenueAutocomplete} from './VenueAutocomplete'
import type {VenueSuggestion} from './VenueAutocomplete'
import {Icon} from './Icon'

type Goal={raceDate:string;raceName:string;raceLocation:string;raceStartTime?:string|null}
type Details={eventKind?:string;routeUrl?:string|null;courseType?:string|null;venue?:string|null;venueAddress?:string|null;city?:string|null;finishVenue?:string|null;finishCity?:string|null;finishAddress?:string|null;startLatitude?:number|null;startLongitude?:number|null;ascentM?:number|null;routeNotes?:string|null}
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
export function ChallengeSetup({active,revision,onSaved,onEventScout}:{active:boolean;revision:number;onSaved:()=>void;onEventScout:()=>void}){
 const [goal,setGoal]=useState<Goal|null>(null),[saved,setSaved]=useState<Details|null>(null)
 const [draft,setDraft]=useState<Draft>(blank()),[editing,setEditing]=useState(false)
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
 const suggest=useCallback(async(query:string,city:string):Promise<VenueSuggestion[]>=>{
  const data=await request({action:'suggest_venues',raceDate:goal?.raceDate,query,city})
  return Array.isArray(data.suggestions)?data.suggestions:[]
 },[goal?.raceDate])
 const update=(key:keyof Draft,value:string)=>setDraft(d=>({...d,[key]:value}))
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
  <header><div><span className="challenge-kicker">DEIN VORHABEN</span><h2>Strecke &amp; Start</h2></div>{isChallenge&&<span className="challenge-mode">Eigene Challenge</span>}</header>
  {loading?<p role="status">Zieldetails werden geladen …</p>:goal&&<>
   <div className="challenge-actions"><button type="button" disabled={busy} onClick={()=>{setDraft(saved?asDraft(saved,goal.raceLocation):blank(goal.raceLocation));setEditing(x=>!x)}}>{editing?'Schließen':isChallenge?'Challenge bearbeiten':'Eigene Challenge einrichten'}</button>
    <button type="button" disabled={busy} onClick={onEventScout}>Offizielles Event · Scout <Icon name="arrow-up-right"/></button></div>
   {!editing&&<div className="challenge-facts">
    <div><small>STRECKENTYP</small><strong>{courses.find(x=>x[0]===saved?.courseType)?.[1]||'Noch offen'}</strong></div>
    <div><small>STARTORT</small><strong>{saved?.venueAddress||saved?.venue||'Noch offen'}</strong></div>
    <div><small>HÖHENMETER</small><strong>{saved?.ascentM!=null?saved.ascentM.toLocaleString('de-DE')+' hm':'Noch offen'}</strong></div>
   </div>}
   {editing&&<div className="challenge-form">
    <label>Komoot-Tour<input type="url" value={draft.route} placeholder="https://www.komoot.com/de-de/tour/…" onChange={e=>update('route',e.target.value)}/></label>
    <label>Streckentyp<select value={draft.course} onChange={e=>update('course',e.target.value)}>{courses.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>Stadt / Region<input value={draft.city} maxLength={100} onChange={e=>{setDraft(d=>({...d,city:e.target.value,lat:'',lon:''}))}}/></label>
    <div><label>Genauer Startpunkt</label><VenueAutocomplete value={draft.start} city={draft.city} disabled={busy} request={suggest} onPick={pick} onChange={v=>setDraft(d=>({...d,start:v,venue:'',lat:'',lon:''}))}/></div>
    <label>Höhenmeter (optional)<input type="number" min="0" max="30000" value={draft.ascent} onChange={e=>update('ascent',e.target.value)}/></label>
    {draft.course==='point_to_point'&&<><label>Zielort<input value={draft.finish} onChange={e=>update('finish',e.target.value)}/></label><label>Zielstadt<input value={draft.finishCity} onChange={e=>update('finishCity',e.target.value)}/></label></>}
    <details className="challenge-coords"><summary>{draft.lat&&draft.lon?'✓ GPS-Startpunkt hinterlegt':'GPS-Startpunkt präzisieren'}</summary><div className="challenge-coord-grid">
     <label>Breitengrad<input type="number" step="any" min="-90" max="90" value={draft.lat} onChange={e=>update('lat',e.target.value)}/></label><label>Längengrad<input type="number" step="any" min="-180" max="180" value={draft.lon} onChange={e=>update('lon',e.target.value)}/></label></div>
     <small>Mit Koordinaten wird die Wetterprognose für den Startpunkt statt für die Stadt geladen.</small></details>
    <label className="challenge-wide">Streckenhinweise<textarea rows={2} maxLength={240} value={draft.notes} onChange={e=>update('notes',e.target.value)}/></label>
    <button type="button" className="challenge-save" disabled={busy} onClick={()=>void save()}>{busy?'Speichere …':'Challenge speichern'}</button>
   </div>}
   {route&&<div className="challenge-map"><iframe title="Komoot-Strecke und Höhenprofil" src={route.url} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/><small>Komoot-Karte und Höhenprofil. Für eine eigene geometrische Analyse GPX in Race Prep hinzufügen; Streckentyp und Höhenmeter werden nicht aus der Einbettung geraten.</small></div>}
  </>}
  {error&&<p role="alert" className="challenge-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}

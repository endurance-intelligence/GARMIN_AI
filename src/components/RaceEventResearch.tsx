import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/race-event-research.css'

type Field='eventName'|'eventDate'|'startTime'|'endTime'|'venue'|'venueAddress'|'city'|
 'officialLoopKm'|'maximumDistanceKm'|'routeNotes'|'routeUrl'|'gpxUrl'
type Details=Record<Field,string|number|null>
type Evidence={field:string;url:string;evidence:string}
type ScanResult={
 sourceUrl:string;details:Details;sources:Evidence[];missing:string[];
 discoveredPages:string[];warnings:string[];needsReview:boolean;saved:boolean;
 routeMetadataStatus:string
}
type SavedResearch={id:string;event_url:string;event_title:string;race_date:string;
 details:Details;evidence:Evidence[];reviewed_at:string}
type GoalStatus={goal:{raceDate:string;raceName:string};saved:SavedResearch[]}
const labels:Record<Field,string>={
 eventName:'Veranstaltung',eventDate:'Veranstaltungsdatum',
 startTime:'Frühester Start',endTime:'Zielschluss',
 venue:'Start-/Zielbereich',venueAddress:'Adresse',
 city:'Veranstaltungsstadt',officialLoopKm:'Offizielle Rundendistanz (km)',
 maximumDistanceKm:'Offiziell maximal mögliche Distanz (km)',
 routeNotes:'Streckenbeschreibung',routeUrl:'Karten-/Komoot-Link',
 gpxUrl:'Öffentlicher GPX-Link'
}
const fields=Object.keys(labels) as Field[]
async function request(body?:Record<string,unknown>):Promise<Record<string,unknown>>{
 if(!garminSupabase)throw Error('Bitte erst anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte erst anmelden.')
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-race-research',{
  method:body?'POST':'GET',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 })
 const json=await response.json().catch(()=>({})) as Record<string,unknown>
 if(!response.ok)throw Error(String(json.error||'Race-Recherche nicht erreichbar (HTTP '+response.status+')'))
 return json
}
function formatField(field:Field,value:string|number|null){
 if(value===null||value==='')return 'Nicht gefunden'
 if(field==='eventDate')return String(value).split('-').reverse().join('.')
 if(field==='startTime'||field==='endTime')return String(value)+' Uhr'
 if(field==='officialLoopKm'||field==='maximumDistanceKm')
  return Number(value).toLocaleString('de-DE',{maximumFractionDigits:2})+' km'
 return String(value)
}
export function RaceEventResearch({active}:{active:boolean}){
 const [goal,setGoal]=useState<GoalStatus['goal']|null>(null)
 const [url,setUrl]=useState('')
 const [scan,setScan]=useState<ScanResult|null>(null)
 const [details,setDetails]=useState<Details|null>(null)
 const [edited,setEdited]=useState<string[]>([])
 const [saved,setSaved]=useState<SavedResearch[]>([])
 const [busy,setBusy]=useState<'scan'|'save'|null>(null)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setError('')
  void request().then(value=>{
   if(!mounted)return
   const result=value as unknown as GoalStatus
   setGoal(result.goal)
   setSaved(result.saved||[])
   if(result.saved?.length){
    setUrl(result.saved[0].event_url)
    setScan(null);setDetails(null)
   }else if(/heartbeat ultra/i.test(result.goal.raceName)){
    setUrl('https://www.heartbeat-ultra.de/')
   }
  }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Daten nicht abrufbar')})
  return ()=>{mounted=false}
 },[active])
 async function runScan(){
  if(!goal||busy)return
  setBusy('scan');setError('');setNotice('');setScan(null);setDetails(null);setEdited([])
  try{
   const result=await request({action:'scan',raceDate:goal.raceDate,url}) as unknown as ScanResult
   setScan(result);setDetails(result.details)
   setUrl(result.sourceUrl)
  }catch(e){setError(e instanceof Error?e.message:'Website konnte nicht überprüft werden.')}
  finally{setBusy(null)}
 }
 function update(field:Field,value:string){
  if(!details)return
  const parsed=field==='officialLoopKm'||field==='maximumDistanceKm'?
   (value===''?null:Number(value.replace(',','.'))):value===''?null:value
  setDetails({...details,[field]:parsed})
  setEdited(prev=>prev.includes(field)?prev:[...prev,field])
 }
 async function save(){
  if(!goal||!scan||!details||busy)return
  setBusy('save');setError('');setNotice('')
  try{
   const sources=scan.sources.filter(s=>!edited.includes(s.field))
   const result=await request({action:'save',confirm:true,raceDate:goal.raceDate,
    sourceUrl:scan.sourceUrl,details,sources})
   if(result.saved!==true)throw Error('Die Speicherung wurde nicht bestätigt.')
   const record=result.record as SavedResearch
   setSaved(old=>[record,...old.filter(x=>x.id!==record.id)])
   setNotice('Veranstaltungsdaten gespeichert – inklusive Quellen. Dein persönliches Trainingsziel bleibt unverändert.')
   setScan(null);setDetails(null);setEdited([])
  }catch(e){setError(e instanceof Error?e.message:'Recherche konnte nicht gespeichert werden.')}
  finally{setBusy(null)}
 }
 if(!active)return null
 const chosen=scan&&details?details:null
 return <section className="rer-root" aria-label="Event-Webseite recherchieren und speichern">
  <div className="rer-head"><div>
   <span className="rer-kicker">RACE PREP / EVENT SCOUT</span>
   <h2>Veranstaltung automatisch recherchieren.</h2>
   <p>Nur die offizielle Webseite einfügen: Event Scout prüft diese und bis zu drei relevante Unterseiten.
    Alles Gefundene kannst du vor dem Speichern bearbeiten.</p>
  </div><span className="rer-flag">MIT QUELLEN</span></div>
  <div className="rer-entry">
   <label htmlFor="rer-url">Veranstalter-Webseite (HTTPS)</label>
   <div className="rer-url-row">
    <input type="url" id="rer-url" placeholder="https://www.mein-wettkampf.de/" value={url}
     onChange={e=>setUrl(e.target.value)} autoComplete="url" spellCheck={false}/>
    <button type="button" disabled={!!busy||!goal||!url.trim()} onClick={()=>void runScan()}>
     {busy==='scan'?'Prüfe Website …':'Website analysieren'}
    </button>
   </div>
   {goal?<p>Aktives Ziel: <b>{goal.raceName}</b> · {goal.raceDate.split('-').reverse().join('.')}</p>:
    <p>Bitte zuerst oben dein Wettkampfziel speichern. Danach kannst du den Event Scout starten.</p>}
  </div>
  {chosen&&<div className="rer-result">
   <div className="rer-result-title"><div>
    <strong>Gefunden und zur Prüfung vorbereitet</strong>
    <p>{scan.discoveredPages.length} geprüfte Seite(n) ·
     {scan.missing.length? ' '+scan.missing.length+' wesentliche Angabe(n) fehlen':' Basisangaben vorhanden'}</p>
   </div><span>NOCH NICHT GESPEICHERT</span></div>
   <div className="rer-grid">
    {fields.map(field=>{
     const value=chosen[field]
     const evidence=!edited.includes(field)?scan.sources.find(s=>s.field===field):null
     const isLong=field==='routeNotes'
     const input=field==='eventDate'?'date':
      field==='startTime'||field==='endTime'?'time':
      field==='officialLoopKm'||field==='maximumDistanceKm'?'number':'text'
     return <label className={'rer-field'+(isLong?' rer-wide':'')} key={field}>
      <span>{labels[field]}</span>
      {isLong?<textarea value={value===null?'':String(value)} rows={2}
       onChange={e=>update(field,e.target.value)}/>:
       <input type={input} min={input==='number'?'0.1':undefined}
        step={input==='number'?'0.1':undefined}
        value={value===null?'':String(value)}
        onChange={e=>update(field,e.target.value)}
        placeholder="Nicht gefunden"/>}
      {edited.includes(field)?<small className="rer-manual">Manuell bearbeitet</small>:
       evidence?<small className="rer-evidence">
        <a href={evidence.url} target="_blank" rel="noreferrer">Quelle öffnen</a>
        <span>{evidence.evidence}</span>
       </small>:<small className="rer-missing">Keine belegte Angabe – offen lassen oder selbst ergänzen.</small>}
     </label>
    })}
   </div>
   {scan.warnings.length>0&&<div className="rer-warnings">
    {scan.warnings.map((w,i)=><p key={i}>{w}</p>)}</div>}
   <p className="rer-disclaimer">
    Ein gefundener Komoot-Link bedeutet noch nicht, dass GPX, Höhenmeter und Untergrund erfolgreich ausgelesen wurden.
    Die persönlichen Wettkampfkilometer werden niemals aus der Rundenlänge überschrieben.
   </p>
   <button type="button" className="rer-save" disabled={!!busy} onClick={()=>void save()}>
    {busy==='save'?'Speichere …':'Diese Angaben und Quellen speichern'}
   </button>
  </div>}
  {saved.length>0&&<div className="rer-saved">
   <strong>Gespeicherte Veranstaltungsdaten</strong>
   {saved.map(item=><article key={item.id}>
    <div><b>{item.event_title}</b>
     <p>{item.race_date.split('-').reverse().join('.')} · {formatField('venue',item.details?.venue||null)}
      {item.details?.officialLoopKm?' · Runde '+formatField('officialLoopKm',item.details.officialLoopKm):''}</p>
     <p className="rer-muted">Geprüft am {new Date(item.reviewed_at).toLocaleDateString('de-DE')} ·
      {item.evidence?.length||0} Quellenbelege</p>
    </div>
    <div className="rer-links">
     <a href={item.event_url} target="_blank" rel="noreferrer">Eventseite</a>
     {item.details?.routeUrl&&<a href={String(item.details.routeUrl)} target="_blank" rel="noreferrer">Strecke ansehen</a>}
     {item.details?.gpxUrl&&<a href={String(item.details.gpxUrl)} target="_blank" rel="noreferrer">GPX</a>}
    </div>
   </article>)}
  </div>}
  {notice&&<p className="rer-notice" role="status">{notice}</p>}
  {error&&<p className="rer-error" role="alert">{error}</p>}
 </section>
}

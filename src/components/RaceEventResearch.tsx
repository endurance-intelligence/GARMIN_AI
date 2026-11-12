import {useCallback,useEffect,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import {komootEmbedFromTour} from '../lib/komootEmbed.mjs'
import {VenueAutocomplete} from './VenueAutocomplete'
import type {VenueSuggestion} from './VenueAutocomplete'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/race-event-research.css'

type Field='eventName'|'eventDate'|'startTime'|'endTime'|'venue'|'venueAddress'|'city'|
 'officialLoopKm'|'maximumDistanceKm'|'routeNotes'|'routeUrl'|'gpxUrl'|'logoUrl'|'courseType'|'finishVenue'|'finishCity'|'finishAddress'
type Details=Record<Field,string|number|null>
type Evidence={field:string;url:string;evidence:string}
type ScanResult={
 sourceUrl:string;details:Details;sources:Evidence[];missing:string[];
 discoveredPages:string[];warnings:string[];needsReview:boolean;saved:boolean;
 routeMetadataStatus:string;addressResolution?:string
}
type SavedResearch={id:string;event_url:string;event_title:string;race_date:string;
 details:Details;evidence:Evidence[];reviewed_at:string}
type ArchiveEvent={id:string;canonical_url:string;event_name:string;
 template_details:Details;evidence:Evidence[];last_race_date:string|null;updated_at:string}
type GoalStatus={goal:{raceDate:string;raceName:string;raceLocation:string};saved:SavedResearch[];archive:ArchiveEvent[]}
const labels:Record<Field,string>={
 eventName:'Veranstaltung',eventDate:'Veranstaltungsdatum',
 startTime:'Frühester Start',endTime:'Zielschluss',
 venue:'Start-/Zielbereich',venueAddress:'Adresse',
 city:'Veranstaltungsstadt',courseType:'Streckentyp',finishVenue:'Zielbereich',finishCity:'Zielstadt',finishAddress:'Zieladresse',
 officialLoopKm:'Offizielle Rundendistanz (km)',
 maximumDistanceKm:'Offiziell maximal mögliche Distanz (km)',
 routeNotes:'Streckenbeschreibung',routeUrl:'Karten-/Komoot-Link',
 gpxUrl:'Öffentlicher GPX-Link',logoUrl:'Offizielles Logo (Bild-URL)'
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
export function RaceEventResearch({active,refreshKey=0,onLogoChange,onEventSaved,onEventCityChange,children}:{
 active:boolean;refreshKey?:number;onLogoChange?:(url:string|null)=>void;onEventSaved?:()=>void;
 onEventCityChange?:(city:string|null)=>void;children?:ReactNode
}){
 const [goal,setGoal]=useState<GoalStatus['goal']|null>(null)
 const [url,setUrl]=useState('')
 const [scan,setScan]=useState<ScanResult|null>(null)
 const [details,setDetails]=useState<Details|null>(null)
 const [edited,setEdited]=useState<string[]>([])
 const [saved,setSaved]=useState<SavedResearch[]>([])
 const [archive,setArchive]=useState<ArchiveEvent[]>([])
 const [fromArchive,setFromArchive]=useState<string|null>(null)
 const [selectedSources,setSelectedSources]=useState<Evidence[]>([])
 const [routeEdit,setRouteEdit]=useState(false)
 const [addressInput,setAddressInput]=useState('')
 const [routeEditing,setRouteEditing]=useState<string|null>(null)
 const [routeDraft,setRouteDraft]=useState('')
 const [busy,setBusy]=useState<'scan'|'save'|null>(null)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [finishAddressInput,setFinishAddressInput]=useState('')
 const initializedGoal=useRef<string|null>(null)
 const cacheKey=(date:string)=>'garmin-ai:race-scout:draft:v1:'+date
 const readDraft=(date:string)=>{
  try{
   const raw=sessionStorage.getItem(cacheKey(date))
   if(raw&&raw.length<110000){
    const data=JSON.parse(raw) as Record<string,unknown>
    if(data.raceDate===date&&typeof data.url==='string')return data
   }
  }catch{}
  return null
 }
 useEffect(()=>{
  if(!active)return
  let mounted=true
  // Switching app tabs is not a change of the selected race.
  // Keep unsaved research and restore a draft after a browser tab reload.
  setError('')
  void request().then(value=>{
   if(!mounted)return
   const result=value as unknown as GoalStatus
   if(initializedGoal.current!==result.goal.raceDate){
    initializedGoal.current=result.goal.raceDate
    const draft=readDraft(result.goal.raceDate)
    setScan((draft?.scan||null) as ScanResult|null)
    setDetails((draft?.details||null) as Details|null)
    setEdited(Array.isArray(draft?.edited)?draft.edited as string[]:[])
    setFromArchive(typeof draft?.fromArchive==='string'?draft.fromArchive:null)
    setSelectedSources(Array.isArray(draft?.selectedSources)?draft.selectedSources as Evidence[]:[])
    setAddressInput(typeof draft?.addressInput==='string'?draft.addressInput:'')
    setFinishAddressInput(typeof draft?.finishAddressInput==='string'?draft.finishAddressInput:'')
    setRouteDraft(typeof draft?.routeDraft==='string'?draft.routeDraft:'')
    setRouteEditing(typeof draft?.routeEditing==='string'?draft.routeEditing:null)
    setRouteEdit(draft?.routeEdit===true)
    setUrl(typeof draft?.url==='string'?draft.url:
     /heartbeat ultra/i.test(result.goal.raceName)?'https://www.heartbeat-ultra.de/':'')
   }
   setGoal(result.goal)
   setSaved(result.saved||[])
   setArchive(result.archive||[])
   const matchingSaved=(result.saved||[])[0]
   onEventCityChange?.(typeof matchingSaved?.details?.city==='string'?matchingSaved.details.city:null)
   const matchingArchive=(result.archive||[]).find(x=>x.canonical_url===matchingSaved?.event_url)
   onLogoChange?.(String(matchingSaved?.details?.logoUrl||matchingArchive?.template_details?.logoUrl||'')||null)
   // Existing user draft takes precedence over reloading the saved event.
   if(!readDraft(result.goal.raceDate)&&result.saved?.length&&
      !scan&&!details)setUrl(result.saved[0].event_url)
  }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Daten nicht abrufbar')})
  return ()=>{mounted=false}
 },[active,refreshKey])
 useEffect(()=>{
  if(!goal||initializedGoal.current!==goal.raceDate)return
  try{
   sessionStorage.setItem(cacheKey(goal.raceDate),JSON.stringify({
    raceDate:goal.raceDate,url,scan,details,edited,fromArchive,selectedSources,
    addressInput,finishAddressInput,routeDraft,routeEditing,routeEdit
   }))
  }catch{/* Session storage may be disabled; keep in-memory state. */}
 },[goal,url,scan,details,edited,fromArchive,selectedSources,addressInput,finishAddressInput,routeDraft,routeEditing,routeEdit])
 function clearCurrentDraft(){
  if(goal)try{sessionStorage.removeItem(cacheKey(goal.raceDate))}catch{}
 }
 async function runScan(){
  if(!goal||busy)return
  setBusy('scan');setError('');setNotice('');setScan(null);setDetails(null);setEdited([])
  try{
   const result=await request({action:'scan',raceDate:goal.raceDate,url}) as unknown as ScanResult
   setScan(result);setDetails(result.details);setAddressInput(String(result.details.venueAddress||''))
   setFinishAddressInput(String(result.details.finishAddress||''))
   setFromArchive(null);setSelectedSources([]);setRouteEdit(false)
   setUrl(result.sourceUrl)
   onLogoChange?.(typeof result.details.logoUrl==='string'?result.details.logoUrl:null)
  }catch(e){setError(e instanceof Error?e.message:'Website konnte nicht überprüft werden.')}
  finally{setBusy(null)}
 }
 function update(field:Field,value:string){
  if(!details)return
  const parsed=field==='officialLoopKm'||field==='maximumDistanceKm'?
   (value===''?null:Number(value.replace(',','.'))):value===''?null:value
  setDetails({...details,[field]:parsed,
   ...(field==='courseType'&&parsed!=='point_to_point'?{finishVenue:null,finishCity:null,finishAddress:null}:{})})
  if(field==='courseType'&&parsed!=='point_to_point')setFinishAddressInput('')
  if(field==='venueAddress')setAddressInput(value)
  if(field==='finishAddress')setFinishAddressInput(value)
  if(field==='logoUrl')onLogoChange?.(typeof parsed==='string'?parsed:null)
  setEdited(prev=>prev.includes(field)?prev:[...prev,field])
 }
 async function save(){
  if(!goal||!scan||!details||busy)return
  setBusy('save');setError('');setNotice('')
  try{
   const sources=[...scan.sources.filter(s=>!edited.includes(s.field)),...selectedSources]
   // An unselected search query is not a verified street address.
   if(details.venueAddress&&
     !/\b\d+[a-z]?\s*,?\s*\d{4,6}\s+\S/i.test(String(details.venueAddress))&&
     !selectedSources.some(x=>x.field==='venueAddress')&&
     edited.includes('venueAddress'))
    throw Error('Bitte eine vollständige Adresse wählen oder Straße, Hausnummer und PLZ eingeben.')
   const result=await request({action:'save',confirm:true,raceDate:goal.raceDate,
    sourceUrl:scan.sourceUrl,details,sources})
   if(result.saved!==true)throw Error('Die Speicherung wurde nicht bestätigt.')
   const record=result.record as SavedResearch
   setSaved(old=>[record,...old.filter(x=>x.id!==record.id)])
   if(result.archive){
    const item=result.archive as ArchiveEvent
    setArchive(old=>[item,...old.filter(x=>x.id!==item.id)])
   }
   onLogoChange?.(typeof record.details?.logoUrl==='string'?record.details.logoUrl:null)
   onEventCityChange?.(typeof record.details?.city==='string'?record.details.city:null)
   onEventSaved?.()
   setNotice(result.archiveSaved===false?
    'Austragung gespeichert; Archiv konnte nicht aktualisiert werden. Bitte später erneut speichern.':
    'Veranstaltung und ihre Strecke im Archiv gespeichert. Dein persönliches Trainingsziel bleibt unverändert.')
   clearCurrentDraft()
   setScan(null);setDetails(null);setEdited([]);setSelectedSources([]);setFromArchive(null)
  }catch(e){setError(e instanceof Error?e.message:'Recherche konnte nicht gespeichert werden.')}
  finally{setBusy(null)}
 }
 async function saveRouteLink(item:SavedResearch){
  if(!goal||busy)return
  const route=komootEmbedFromTour(routeDraft)
  if(!route){setError('Bitte einen gültigen Komoot-Tour-Link verwenden.');return}
  setBusy('save');setError('');setNotice('')
  try{
   const changed={...item.details,routeUrl:routeDraft.trim()}
   const evidence=item.evidence.filter(x=>x.field!=='routeUrl')
   evidence.push({field:'routeUrl',url:route.canonicalUrl,
    evidence:'Komoot-Tour vom Athleten für diese Austragung ausgewählt'})
   const result=await request({action:'save',confirm:true,raceDate:goal.raceDate,
    sourceUrl:item.event_url,details:changed,sources:evidence})
   if(result.saved!==true||!result.record)throw Error('Streckenlink wurde nicht bestätigt.')
   const record=result.record as SavedResearch
   setSaved(old=>[record,...old.filter(x=>x.id!==record.id)])
   if(result.archive){
    const archived=result.archive as ArchiveEvent
    setArchive(old=>[archived,...old.filter(x=>x.id!==archived.id)])
   }
   setRouteEditing(null);setRouteDraft('')
   setNotice(result.archiveSaved===false?
    'Komoot-Link für dieses Jahr gespeichert. Archivvorlage konnte nicht aktualisiert werden.':
    'Komoot-Link mit dieser Austragung und der Archivvorlage verknüpft. Frühere Rennen bleiben unverändert.')
   onEventSaved?.()
  }catch(e){setError(e instanceof Error?e.message:'Streckenlink nicht gespeichert.')}
  finally{setBusy(null)}
 }
 const suggest=useCallback(async(query:string,city:string):Promise<VenueSuggestion[]>=>{
  const data=await request({action:'suggest_venues',raceDate:goal?.raceDate,query,city})
  return (Array.isArray(data.suggestions)?data.suggestions:[]) as VenueSuggestion[]
 },[goal?.raceDate])
 function pickVenue(item:VenueSuggestion){
  if(!details)return
  const address=item.address
  setDetails({...details,venue:item.name,city:item.city,venueAddress:address})
  setAddressInput(address||item.name)
  setEdited(old=>[...new Set([...old,'venue','city','venueAddress'])])
  const sources:Evidence[]=[
   {field:'venue',url:item.source,evidence:'Aus Ortsauswahl: '+item.name},
   {field:'city',url:item.source,evidence:'Aus Ortsauswahl: '+item.city},
   ...(address?[{field:'venueAddress',url:item.source,evidence:'Ortsauswahl: '+address}]:[])
  ]
  setSelectedSources(sources)
  setNotice(address?'Adresse aus Ortsauswahl übernommen.':'Ort gefunden – genaue Straße und Hausnummer fehlen beim Kartendienst.')
 }
 function pickFinish(item:VenueSuggestion){
  if(!details)return
  setDetails({...details,finishVenue:item.name,finishCity:item.city,finishAddress:item.address})
  setFinishAddressInput(item.address||item.name)
  setEdited(old=>[...new Set([...old,'finishVenue','finishCity','finishAddress'])])
  setSelectedSources(old=>[...old.filter(s=>!['finishVenue','finishCity','finishAddress'].includes(s.field)),
   {field:'finishVenue',url:item.source,evidence:'Aus Ortsauswahl: '+item.name},
   {field:'finishCity',url:item.source,evidence:'Aus Ortsauswahl: '+item.city},
   ...(item.address?[{field:'finishAddress',url:item.source,evidence:'Aus Ortsauswahl: '+item.address}]:[])])
 }
 function useArchived(item:ArchiveEvent){
  if(!goal)return
  const reused={...item.template_details,eventDate:goal.raceDate} as Details
  const preserved=item.evidence.filter(x=>!['eventDate','startTime','endTime'].includes(x.field))
  setScan({sourceUrl:item.canonical_url,details:reused,sources:preserved,
   missing:[],discoveredPages:[],warnings:[
    'Archivdaten stammen aus einer früheren Austragung ('+(item.last_race_date||'Datum unbekannt')+
    '). Datum, Startzeit und Strecke für dieses Jahr bitte prüfen.'],
   saved:false,needsReview:true,routeMetadataStatus:'archive_route_not_reverified',
   addressResolution:'not_required'})
  setDetails(reused)
  setAddressInput(String(reused.venueAddress||''))
  setFinishAddressInput(String(reused.finishAddress||''))
  setSelectedSources([])
  setEdited(['eventDate','startTime','endTime'])
  setFromArchive(item.event_name)
  setRouteEdit(false)
  setUrl(item.canonical_url)
  onLogoChange?.(typeof reused.logoUrl==='string'?reused.logoUrl:null)
  setNotice('Aus Archiv übernommen. Die Strecke kann unverändert bleiben oder für diese Austragung geändert werden.')
  setError('')
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
  <div className="rer-archive">
   <div className="rer-archive-head"><div><span className="rer-kicker">WETTKAMPFARCHIV</span>
    <h3>Schon einmal gelaufen? Einfach übernehmen.</h3>
    <p>Veranstaltung, Strecke und Logo wiederverwenden. Datum und Startzeit für die neue Austragung prüfen.</p></div>
    <span className="rer-archive-count">{archive.length} Event{archive.length===1?'':'s'}</span>
   </div>
   {archive.length>0?<div className="rer-archive-cards">
    {archive.map(item=><article key={item.id}>
     {typeof item.template_details?.logoUrl==='string'&&
      <img src={item.template_details.logoUrl} alt={'Logo '+item.event_name}
       referrerPolicy="no-referrer" loading="lazy"/>}
     <div><strong>{item.event_name}</strong>
      <small>Zuletzt {item.last_race_date?item.last_race_date.split('-').reverse().join('.'): 'ohne Datum'}
       {item.template_details?.officialLoopKm?' · Runde '+item.template_details.officialLoopKm+' km':''}</small>
      <span>{item.template_details?.venue||item.template_details?.city||'Startort nicht hinterlegt'}</span></div>
     <button type="button" disabled={!goal||!!busy} onClick={()=>useArchived(item)}>
      Für aktuelles Ziel übernehmen
     </button>
    </article>)}
   </div>:<p className="rer-empty-archive">Noch kein archiviertes Event. Nach dem ersten bestätigten Speichern erscheint es hier – auch für die nächste Austragung.</p>}
  </div>
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
    <p>{fromArchive?'Aus gespeicherten Veranstaltungsdaten':scan.discoveredPages.length+' geprüfte Seite(n)'} ·
     {scan.missing.length? ' '+scan.missing.length+' wesentliche Angabe(n) fehlen':' Basisangaben vorhanden'}</p>
   </div><span>NOCH NICHT GESPEICHERT</span></div>
   {fromArchive&&<div className="rer-reuse-note">
    <strong>Aus dem Archiv: {fromArchive}</strong>
    <span>Strecke und Veranstaltungsort übernommen. Datum aus deinem aktuellen Ziel. Bitte Startzeiten und Streckenstand prüfen.</span>
    <button type="button" onClick={()=>setRouteEdit(x=>!x)}>
     {routeEdit?'Strecke beibehalten':'Strecke für diese Austragung ändern'}</button>
   </div>}
   {typeof chosen.logoUrl==='string'&&<div className="rer-logo-preview">
    <img src={chosen.logoUrl} loading="lazy" referrerPolicy="no-referrer" alt={'Veranstalterlogo '+(chosen.eventName||'')}/>
    <div><strong>Veranstalterlogo gefunden</strong><small>Originaldatei der Veranstalterseite, kein KI-generiertes Logo.
      Du kannst die URL unten korrigieren.</small></div>
   </div>}
   <div className="rer-grid">
    {fields.filter(field=>chosen.courseType==='point_to_point'?
       field!=='officialLoopKm':
       !['finishVenue','finishCity','finishAddress'].includes(field)).map(field=>{
     const value=chosen[field]
     const evidence=selectedSources.find(s=>s.field===field)||(!edited.includes(field)?scan.sources.find(s=>s.field===field):null)
     const isLong=field==='routeNotes'
     const input=field==='eventDate'?'date':
      field==='startTime'||field==='endTime'?'time':
      field==='officialLoopKm'||field==='maximumDistanceKm'?'number':'text'
     return <label className={'rer-field'+(isLong?' rer-wide':'')} key={field}>
      <span>{field==='venue'&&chosen.courseType==='point_to_point'?'Startbereich':
       field==='city'&&chosen.courseType==='point_to_point'?'Startstadt':
       field==='venueAddress'&&chosen.courseType==='point_to_point'?'Startadresse':labels[field]}</span>
      {field==='courseType'?<select value={String(value||'')} onChange={e=>update('courseType',e.target.value)}>
        <option value="">Nicht bekannt – bitte wählen</option>
        <option value="loop">Rundkurs (Start = Ziel)</option>
        <option value="multi_loop">Mehrrundenlauf</option>
        <option value="point_to_point">Punkt zu Punkt (Start ≠ Ziel)</option>
        <option value="out_and_back">Hin- und Rückweg</option>
       </select>:
       field==='finishAddress'?<VenueAutocomplete value={finishAddressInput}
        city={String(chosen.finishCity||'')} disabled={!!busy} request={suggest}
        onPick={pickFinish} onChange={v=>update('finishAddress',v)}/>:
       field==='venueAddress'?<VenueAutocomplete
        value={addressInput} city={String(chosen.city||goal?.raceLocation||'')} disabled={!!busy}
        request={suggest} onPick={pickVenue}
        onChange={v=>update('venueAddress',v)}/>:
       isLong?<textarea value={value===null?'':String(value)} rows={2}
        onChange={e=>update(field,e.target.value)}/>:
       <input type={input} min={input==='number'?'0.1':undefined}
        step={input==='number'?'0.1':undefined}
        value={value===null?'':String(value)}
        onChange={e=>update(field,e.target.value)}
        placeholder="Nicht gefunden"/>}
      {fromArchive&&['routeUrl','gpxUrl','officialLoopKm'].includes(field)&&routeEdit&&
        <small className="rer-manual">Streckenstand neu prüfen – gespeicherter Archivwert bleibt erhalten, bis du speicherst.</small>}
      {field==='venueAddress'&&value&&!edited.includes(field)&&
       (scan.addressResolution==='matched'||scan.addressResolution==='cached')&&
       <small className="rer-auto-address">✓ Automatisch anhand von Veranstaltungsort und Stadt gefunden · bitte prüfen</small>}
      {edited.includes(field)&&!selectedSources.some(s=>s.field===field)?<small className="rer-manual">Manuell bearbeitet</small>:
       evidence?<small className="rer-evidence">
        <a href={evidence.url} target="_blank" rel="noreferrer">Quelle öffnen</a>
        <span>{evidence.evidence}</span>
       </small>:<small className="rer-missing">Keine belegte Angabe – offen lassen oder selbst ergänzen.</small>}
     </label>
    })}
   </div>
   {['matched','cached','not_found','unavailable'].includes(scan.addressResolution||'')&&
    <p className="rer-geocode-note">
     {scan.addressResolution==='matched'||scan.addressResolution==='cached'?
      'Adressabgleich aus OpenStreetMap-Daten (Photon). Quelle verlinkt; Angaben vor dem Speichern kontrollieren.':
      'Keine eindeutig passende Straßenadresse gefunden. Du kannst die Adresse selbst ergänzen.'}
     {' '}Kartendaten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-Mitwirkende</a> (ODbL).
    </p>}
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
     <button type="button" disabled={!!busy}
      onClick={()=>{setRouteEditing(routeEditing===item.id?null:item.id);
       setRouteDraft(String(item.details.routeUrl||''));setError('')}}>
      {routeEditing===item.id?'Abbrechen':'Komoot-Link ändern'}</button>
    </div>
    {routeEditing===item.id&&<div className="rer-route-editor">
     <label htmlFor="rer-route-link">Komoot-Tour-Link für diese Austragung</label>
     <div><input id="rer-route-link" type="url" autoComplete="url" spellCheck={false}
       placeholder="https://www.komoot.com/de-de/tour/..."
       value={routeDraft} onChange={e=>setRouteDraft(e.target.value)}/>
      <button type="button" disabled={!!busy||!komootEmbedFromTour(routeDraft)}
       onClick={()=>void saveRouteLink(item)}>Strecke verknüpfen</button>
     </div>
     <small>Die neue Tour ersetzt nur den Streckenlink dieser Austragung und aktualisiert die
      Vorlage im Eventarchiv. Ältere Austragungen behalten ihre Strecke.</small>
    </div>}
   </article>)}
   {children&&<div className="rer-event-dossier">
    <div className="rer-event-dossier-head"><span className="rer-kicker">DEIN EVENT-DOSSIER</span>
     <h3>{saved[0].event_title} · {saved[0].race_date.split('-').reverse().join('.')}</h3>
     <p>Rennwetter, offizielle Strecke und Höhenprofil gehören zu dieser Austragung.</p>
    </div>
    {children}
   </div>}
  </div>}
  {notice&&<p className="rer-notice" role="status">{notice}</p>}
  {error&&<p className="rer-error" role="alert">{error}</p>}
 </section>
}
